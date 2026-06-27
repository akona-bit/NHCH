from fastapi import FastAPI, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import io
from pydantic import BaseModel
from typing import List, Dict, Any

from irt import mmle, chi_square, theta_estimate, true_score
from item_plot import ketQuaCham, tinh_diem
import ctt

class PipelineData(BaseModel):
    ma_ky_thi: int
    df_raw: List[Dict[str, Any]]
    df_answer: List[Dict[str, Any]]

app = FastAPI()

def quality_flag(p_val, disc, irt_a, irt_b, chi2_pval):
    if disc < 0 or (chi2_pval is not None and chi2_pval < 0.05):
        return 'critical'
    if p_val < 0.2 or p_val > 0.9 or irt_a < 0.5 or abs(irt_b) > 3:
        return 'warn'
    return 'ok'

@app.post("/api/run-pipeline")
async def run_pipeline(data: PipelineData):
    try:
        df_raw = pd.DataFrame(data.df_raw)
        df_answer = pd.DataFrame(data.df_answer)
        
        # Bước 1: Chấm điểm bằng hàm gốc từ item_plot.py
        if len(df_answer) > 0:
            df_chamdiem = ketQuaCham(df_raw, df_answer)
        else:
            # Nếu không có df_answer (đã pre-scored), dùng trực tiếp
            df_chamdiem = df_raw.copy()
        
        # Đảm bảo có cột MaDe và Gioi (cần cho ctt.cal_diff và ctt.cal_disc)
        if 'MaDe' not in df_chamdiem.columns:
            df_chamdiem['MaDe'] = 0
        if 'Gioi' not in df_chamdiem.columns:
            df_chamdiem['Gioi'] = ''
        
        # Bước 2: Tính điểm thô bằng hàm gốc từ item_plot.py
        df_chamdiem = tinh_diem(df_chamdiem)

        # Bước 3: CTT
        cau_cols = [c for c in df_chamdiem.columns if c.startswith('Cau')]
        
        p_values = ctt.cal_diff(df_chamdiem)
        disc_ctt = ctt.cal_disc(df_chamdiem)
        std_total = df_chamdiem['Raw'].std()
        
        pbcc_dict = {}
        for col in cau_cols:
            true_g = df_chamdiem[df_chamdiem[col] == 1]['Raw']
            false_g = df_chamdiem[df_chamdiem[col] == 0]['Raw']
            try:
                pbcc_dict[col] = ctt.cal_pbcc(true_g, false_g, std_total, p_values[col])
            except:
                pbcc_dict[col] = 0.0

        # Bước 4: IRT Calibration bằng MMLE gốc
        U = df_chamdiem[cau_cols].to_numpy()
        a_arr, b_arr = mmle(U, name=f"KyThi_{data.ma_ky_thi}", max_iter=60, K=81)
        item_params = pd.DataFrame({'a': a_arr, 'b': b_arr}, index=cau_cols)

        # Bước 5: Theta estimate
        item_params_list = list(zip(item_params['a'], item_params['b']))
        thetas = theta_estimate(U.tolist(), item_params_list)

        # Bước 6: Chi-square
        df_with_theta = df_chamdiem.copy()
        df_with_theta['Theta'] = thetas
        chi2_df = chi_square(df_with_theta, item_params)

        # Bước 7: True Score
        true_scores = []
        for i in range(len(df_chamdiem)):
            row = df_chamdiem.iloc[i]
            ts = true_score(
                theta=thetas[i],
                raw=int(row['Raw']),
                data=row[cau_cols],
                item_params=item_params
            )
            true_scores.append(ts)

        # Format output
        results_bai_lam = []
        for i in range(len(df_chamdiem)):
            results_bai_lam.append({
                "SBD": str(df_chamdiem.iloc[i].get('SBD', i)),
                "DiemTho": int(df_chamdiem.iloc[i]['Raw']),
                "NangLuc": float(thetas[i]),
                "DiemThuc": float(true_scores[i] / 10.0)
            })

        results_items = []
        for j, col in enumerate(cau_cols):
            pval = float(p_values.get(col, 0))
            disc = float(disc_ctt.get(col, 0))
            irta = float(item_params['a'].iloc[j])
            irtb = float(item_params['b'].iloc[j])
            chi2_pval = float(chi2_df.iloc[j]['p_value']) if 'p_value' in chi2_df.columns and j < len(chi2_df) else None
            
            results_items.append({
                "MaCauHoi": col,
                "CTTDiff": pval,
                "CTTDisc": disc,
                "PtBis": float(pbcc_dict.get(col, 0)),
                "IRTa": irta,
                "IRTb": irtb,
                "Chi2pValue": float(chi2_pval) if chi2_pval is not None else None,
                "QualityFlag": quality_flag(pval, disc, irta, irtb, chi2_pval)
            })

        return {
            "status": "success", 
            "bai_lam": results_bai_lam,
            "items": results_items
        }

    except Exception as e:
        import traceback
        return {"status": "error", "message": str(e), "traceback": traceback.format_exc()}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class IRTData(BaseModel):
    items: List[str]
    responses: List[List[float]] # N students x J items

@app.post("/api/calibrate-irt-json")
async def calibrate_irt_json(data: IRTData):
    try:
        U = np.array(data.responses)
        a_est, b_est = mmle(U, name="MMLE", verbose=False)
        
        results = []
        for i, col in enumerate(data.items):
            results.append({
                "id": col,
                "a": float(a_est[i]),
                "b": float(b_est[i]),
                "fit": 1.0
            })
            
        return {"status": "success", "data": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/calibrate-irt")
async def calibrate_irt(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
            
        item_cols = [c for c in df.columns if c.startswith('Cau')]
        if not item_cols:
            return {"status": "error", "message": "No item columns found (must start with 'Cau')"}
            
        U = df[item_cols].fillna(-1).values
        a_est, b_est = mmle(U, name="MMLE", verbose=False)
        
        results = []
        for i, col in enumerate(item_cols):
            results.append({
                "id": col,
                "a": float(a_est[i]),
                "b": float(b_est[i]),
                "fit": 1.0
            })
        
        return {"status": "success", "data": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Run with: uvicorn main:app --reload
