-- This script creates the missing tables for exam generation if they don't exist in Supabase yet.

-- 1. TẠO BẢNG ky_thi_cau_hoi ĐỂ LƯU ĐỀ GỐC CỦA KỲ THI
CREATE TABLE IF NOT EXISTS public.ky_thi_cau_hoi (
    ma_ky_thi INT NOT NULL,
    ma_cau_hoi INT NOT NULL,
    PRIMARY KEY (ma_ky_thi, ma_cau_hoi),
    CONSTRAINT fk_ktch_kythi FOREIGN KEY (ma_ky_thi) REFERENCES public.ky_thi(ma_ky_thi) ON DELETE CASCADE,
    CONSTRAINT fk_ktch_cauhoi FOREIGN KEY (ma_cau_hoi) REFERENCES public.cau_hoi(ma_cau_hoi) ON DELETE CASCADE
);
ALTER TABLE public.ky_thi_cau_hoi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View all ky_thi_cau_hoi" ON public.ky_thi_cau_hoi;
DROP POLICY IF EXISTS "Insert ky_thi_cau_hoi" ON public.ky_thi_cau_hoi;
CREATE POLICY "View all ky_thi_cau_hoi" ON public.ky_thi_cau_hoi FOR SELECT USING (true);
CREATE POLICY "Insert ky_thi_cau_hoi" ON public.ky_thi_cau_hoi FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Delete ky_thi_cau_hoi" ON public.ky_thi_cau_hoi FOR DELETE USING (auth.role() = 'authenticated');

-- 2. TẠO BẢNG dap_an_de_thi ĐỂ LƯU XÁO TRỘN ĐÁP ÁN CHO MỖI MÃ ĐỀ (NẾU CHƯA CÓ)
CREATE TABLE IF NOT EXISTS public.dap_an_de_thi (
    ma_de_thi INT NOT NULL,
    ma_cau_hoi INT NOT NULL,
    ma_dap_an INT NOT NULL,
    thu_tu INT NOT NULL, -- Thứ tự A, B, C, D (1, 2, 3, 4)
    PRIMARY KEY (ma_de_thi, ma_cau_hoi, ma_dap_an),
    CONSTRAINT fk_dadt_dethi FOREIGN KEY (ma_de_thi) REFERENCES public.de_thi(ma_de_thi) ON DELETE CASCADE,
    CONSTRAINT fk_dadt_cauhoi FOREIGN KEY (ma_cau_hoi) REFERENCES public.cau_hoi(ma_cau_hoi) ON DELETE CASCADE,
    CONSTRAINT fk_dadt_dapan FOREIGN KEY (ma_dap_an) REFERENCES public.dap_an(ma_dap_an) ON DELETE CASCADE
);
ALTER TABLE public.dap_an_de_thi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View all dap_an_de_thi" ON public.dap_an_de_thi;
DROP POLICY IF EXISTS "Manage dap_an_de_thi" ON public.dap_an_de_thi;
CREATE POLICY "View all dap_an_de_thi" ON public.dap_an_de_thi FOR SELECT USING (true);
CREATE POLICY "Manage dap_an_de_thi" ON public.dap_an_de_thi FOR ALL USING (auth.role() = 'authenticated');
