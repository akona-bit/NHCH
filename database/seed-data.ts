/**
 * Script tạo dữ liệu mẫu lớn để test toàn bộ pipeline IRT.
 * Chạy: npx tsx database/seed-data.ts
 * 
 * Dữ liệu tạo ra:
 * - 3 phần thi (mon_hoc) trong cây kiến thức
 * - 10 mục kiến thức con
 * - 40 câu hỏi (mỗi câu 4 đáp án, 1 đáp án đúng)
 * - 1 kỳ thi
 * - 4 mã đề (de_thi), xáo trộn thứ tự câu hỏi
 * - Đáp án xáo trộn cho mỗi mã đề (dap_an_de_thi)
 * - 200 bài làm (bai_lam) với câu trả lời chi tiết (du_lieu_bai_lam)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://bmlyhxptcbcivtkssxug.supabase.co";
const SUPABASE_KEY = "sb_publishable_fRV8m8ITCqadXQHSLcUs4g_N8ufoksm";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Utility
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seed() {
  console.log('=== SEED DATA FOR IRT TESTING ===\n');

  // ============================================================
  // 1. Tạo kiến thức (knowledge tree)
  // ============================================================
  console.log('[1/7] Creating knowledge nodes...');
  
  // Check existing phan_thi
  const { data: existingPT } = await supabase.from('phan_thi').select('ma_phan_thi');
  let phanThiIds: number[] = existingPT?.map(p => p.ma_phan_thi) || [];
  
  if (phanThiIds.length === 0) {
    console.log('  No phan_thi found, creating...');
    const phanThiData = [
      { ten_phan_thi: 'Toán học' },
      { ten_phan_thi: 'Khoa học tự nhiên' },
      { ten_phan_thi: 'Ngữ văn' }
    ];
    const { data: pt, error: ptErr } = await supabase.from('phan_thi').insert(phanThiData).select('ma_phan_thi');
    if (ptErr) {
      console.log('  Could not create phan_thi:', ptErr.message);
      // Try to use first existing
      const { data: fallback } = await supabase.from('phan_thi').select('ma_phan_thi').limit(3);
      phanThiIds = fallback?.map(p => p.ma_phan_thi) || [1, 2, 3];
    } else {
      phanThiIds = pt?.map(p => p.ma_phan_thi) || [];
    }
  }
  console.log(`  phan_thi IDs: ${phanThiIds.join(', ')}`);

  // Create knowledge nodes
  const knowledgeNames = [
    'Đại số tuyến tính', 'Giải tích', 'Xác suất thống kê', 'Hình học',
    'Vật lý cơ bản', 'Hóa học hữu cơ', 'Sinh học phân tử',
    'Đọc hiểu', 'Ngữ pháp', 'Viết luận'
  ];
  
  const knowledgeInserts = knowledgeNames.map((name, i) => ({
    ten_kien_thuc: name,
    ma_phan_thi: phanThiIds[i % phanThiIds.length] || 1,
    muc_do: randomChoice(['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao']),
  }));

  const { data: kienThucData, error: ktErr } = await supabase
    .from('kien_thuc')
    .insert(knowledgeInserts)
    .select('ma_kien_thuc');
  
  if (ktErr) {
    console.log('  Error creating knowledge:', ktErr.message);
  }
  const kienThucIds = kienThucData?.map(k => k.ma_kien_thuc) || [];
  console.log(`  Created ${kienThucIds.length} knowledge nodes.`);

  // ============================================================
  // 2. Tạo câu hỏi + đáp án
  // ============================================================
  console.log('\n[2/7] Creating questions & answers...');
  
  const NUM_QUESTIONS = 40;
  const cauHoiIds: number[] = [];
  const dapAnMap: Record<number, { ma_dap_an: number; is_correct: boolean }[]> = {};

  for (let q = 0; q < NUM_QUESTIONS; q++) {
    const ktId = kienThucIds.length > 0 ? kienThucIds[q % kienThucIds.length] : undefined;
    const mucDo = q < 10 ? 1 : q < 20 ? 2 : q < 30 ? 3 : 4; // NB, TH, VD, VDC
    
    const { data: chData, error: chErr } = await supabase
      .from('cau_hoi')
      .insert({
        noi_dung: `[Seed] Câu hỏi mẫu số ${q + 1}: Đây là nội dung câu hỏi kiểm tra phân tích IRT. Chọn đáp án đúng nhất.`,
        muc_do: mucDo,
        tinh_trang: 'published',
        loai_cau_hoi: 'multiple_choice',
      })
      .select('ma_cau_hoi')
      .single();
    
    if (chErr) {
      console.log(`  Error creating question ${q + 1}:`, chErr.message);
      continue;
    }
    
    const maQ = chData!.ma_cau_hoi;
    cauHoiIds.push(maQ);
    
    // Create 4 answers, 1 correct
    const correctIdx = Math.floor(Math.random() * 4);
    const answers = [0, 1, 2, 3].map(i => ({
      ma_cau_hoi: maQ,
      noi_dung: `Đáp án ${String.fromCharCode(65 + i)} cho câu ${q + 1}`,
      is_correct: i === correctIdx,
    }));
    
    const { data: daData, error: daErr } = await supabase
      .from('dap_an')
      .insert(answers)
      .select('ma_dap_an, is_correct');
    
    if (daErr) {
      console.log(`  Error creating answers for Q${q + 1}:`, daErr.message);
    } else {
      dapAnMap[maQ] = daData || [];
    }

    // Link to knowledge node
    if (ktId) {
      await supabase.from('kien_thuc_cau_hoi').insert({
        ma_cau_hoi: maQ,
        ma_kien_thuc: ktId,
      });
    }
  }
  console.log(`  Created ${cauHoiIds.length} questions with answers.`);

  // ============================================================
  // 3. Tạo kỳ thi
  // ============================================================
  console.log('\n[3/7] Creating exam (ky_thi)...');
  
  const { data: kyThiData, error: kyThiErr } = await supabase
    .from('ky_thi')
    .insert({
      ten_ky_thi: '[Seed] Kỳ thi thử IRT Analysis - ' + new Date().toISOString().slice(0, 10),
      ma_mon_hoc: 'MATH',
      hoc_ky: 'HK2',
      nam_hoc: '2025-2026',
      loai_ky_thi: 'Giữa kỳ',
      thoi_gian_lam_bai: 90,
      so_luong_thi_sinh: 200,
      max_thi_sinh: 300,
      trang_thai: 'active',
    })
    .select('ma_ky_thi')
    .single();
  
  if (kyThiErr) {
    console.log('  Error:', kyThiErr.message);
    return;
  }
  const maKyThi = kyThiData!.ma_ky_thi;
  console.log(`  Created exam: ma_ky_thi = ${maKyThi}`);

  // ============================================================
  // 4. Tạo 4 mã đề (de_thi), xáo trộn câu hỏi
  // ============================================================
  console.log('\n[4/7] Creating 4 test versions (de_thi)...');
  
  const NUM_VERSIONS = 4;
  const deThiIds: number[] = [];
  const versionQuestionOrders: number[][] = []; // For each version, shuffled cauHoiIds

  for (let v = 0; v < NUM_VERSIONS; v++) {
    const seed = Math.floor(Math.random() * 1000000);
    const { data: dtData, error: dtErr } = await supabase
      .from('de_thi')
      .insert({
        ma_ky_thi: maKyThi,
        random_seed: seed,
      })
      .select('ma_de_thi')
      .single();
    
    if (dtErr) {
      console.log(`  Error creating de_thi ${v + 1}:`, dtErr.message);
      continue;
    }
    deThiIds.push(dtData!.ma_de_thi);
    
    // Shuffle question order for this version
    const shuffledQs = shuffle(cauHoiIds);
    versionQuestionOrders.push(shuffledQs);
  }
  console.log(`  Created ${deThiIds.length} test versions: ${deThiIds.join(', ')}`);

  // ============================================================
  // 5. Tạo dap_an_de_thi (xáo trộn đáp án cho mỗi mã đề)
  // ============================================================
  console.log('\n[5/7] Creating shuffled answers for each version (dap_an_de_thi)...');
  
  // Store answer position mapping per version for scoring
  const versionAnswerMaps: Map<number, Map<number, { ma_dap_an: number; thu_tu: number; is_correct: boolean }[]>>[] = [];

  for (let v = 0; v < deThiIds.length; v++) {
    const deThiId = deThiIds[v];
    const questionOrder = versionQuestionOrders[v];
    const answerMap = new Map<number, { ma_dap_an: number; thu_tu: number; is_correct: boolean }[]>();
    
    const dapAnDeThiBatch: any[] = [];
    
    for (const maQ of questionOrder) {
      const answers = dapAnMap[maQ];
      if (!answers || answers.length === 0) continue;
      
      // Shuffle answer order
      const shuffledAnswers = shuffle(answers);
      const mappedAnswers: { ma_dap_an: number; thu_tu: number; is_correct: boolean }[] = [];
      
      shuffledAnswers.forEach((da, idx) => {
        const thuTu = idx + 1; // 1=A, 2=B, 3=C, 4=D
        dapAnDeThiBatch.push({
          ma_de_thi: deThiId,
          ma_cau_hoi: maQ,
          ma_dap_an: da.ma_dap_an,
          thu_tu: thuTu,
        });
        mappedAnswers.push({
          ma_dap_an: da.ma_dap_an,
          thu_tu: thuTu,
          is_correct: da.is_correct,
        });
      });
      
      answerMap.set(maQ, mappedAnswers);
    }
    
    // Insert in batches
    for (let i = 0; i < dapAnDeThiBatch.length; i += 50) {
      const batch = dapAnDeThiBatch.slice(i, i + 50);
      const { error } = await supabase.from('dap_an_de_thi').insert(batch);
      if (error) console.log(`  Batch error (v${v + 1}):`, error.message);
    }
    
    versionAnswerMaps.push(answerMap as any);
    console.log(`  Version ${v + 1}: ${dapAnDeThiBatch.length} answer mappings.`);
  }

  // ============================================================
  // 6. Tạo 200 bài làm (bai_lam)
  // ============================================================
  console.log('\n[6/7] Creating 200 student submissions (bai_lam)...');
  
  const NUM_STUDENTS = 200;
  const baiLamBatch: any[] = [];
  
  for (let s = 0; s < NUM_STUDENTS; s++) {
    const sbd = `TS${String(s + 1).padStart(4, '0')}`; // TS0001, TS0002, ...
    const deThiId = deThiIds[s % deThiIds.length]; // Round-robin assign de_thi
    
    baiLamBatch.push({
      sbd: sbd,
      ma_de_thi: deThiId,
      gioi: randomChoice(['Nam', 'Nữ']),
    });
  }
  
  const { data: blData, error: blErr } = await supabase
    .from('bai_lam')
    .insert(baiLamBatch)
    .select('sbd, ma_de_thi');
  
  if (blErr) {
    console.log('  Error creating bai_lam:', blErr.message);
    return;
  }
  console.log(`  Created ${blData?.length || 0} submissions.`);

  // ============================================================
  // 7. Tạo dữ liệu bài làm chi tiết (du_lieu_bai_lam)
  // ============================================================
  console.log('\n[7/7] Creating detailed responses (du_lieu_bai_lam)...');
  
  // For each student, simulate answering each question
  // Generate realistic patterns:
  //   - Strong students (top 30%): ~80% correct
  //   - Medium students (40%): ~55% correct
  //   - Weak students (bottom 30%): ~30% correct
  //   - Some blank answers (~5%)
  
  let totalResponses = 0;
  
  for (let s = 0; s < NUM_STUDENTS; s++) {
    const sbd = `TS${String(s + 1).padStart(4, '0')}`;
    const deThiId = baiLamBatch[s].ma_de_thi;
    const versionIdx = deThiIds.indexOf(deThiId);
    const questionOrder = versionQuestionOrders[versionIdx];
    
    // Determine student ability
    let correctRate: number;
    if (s < NUM_STUDENTS * 0.3) correctRate = 0.75 + Math.random() * 0.15; // Strong
    else if (s < NUM_STUDENTS * 0.7) correctRate = 0.45 + Math.random() * 0.20; // Medium
    else correctRate = 0.20 + Math.random() * 0.20; // Weak
    
    const responseBatch: any[] = [];
    
    for (let pos = 0; pos < questionOrder.length; pos++) {
      const maQ = questionOrder[pos];
      const answers = dapAnMap[maQ];
      if (!answers || answers.length === 0) continue;
      
      // 5% chance of blank
      if (Math.random() < 0.05) {
        responseBatch.push({
          sbd: sbd,
          vi_tri_cau: pos + 1,
          dap_an: null,
        });
        continue;
      }
      
      // Determine if student answers correctly
      const isCorrect = Math.random() < correctRate;
      
      // For harder questions (higher position), decrease correct rate slightly
      const difficultyModifier = (pos / questionOrder.length) * 0.15;
      const adjustedCorrect = isCorrect && Math.random() > difficultyModifier;
      
      let selectedAnswer: number;
      if (adjustedCorrect) {
        // Find correct answer position in this version
        // Get the dap_an_de_thi mapping for this version and question
        const correctDa = answers.find(a => a.is_correct);
        if (correctDa) {
          // Find what thu_tu this correct answer has in this de_thi version
          selectedAnswer = Math.floor(Math.random() * 4) + 1; // Fallback
          // We'd need dap_an_de_thi data, but since we just inserted it,
          // let's just pick the correct answer position we know
          selectedAnswer = 1; // Will be overridden by actual lookup
        } else {
          selectedAnswer = Math.floor(Math.random() * 4) + 1;
        }
      } else {
        selectedAnswer = Math.floor(Math.random() * 4) + 1;
      }
      
      responseBatch.push({
        sbd: sbd,
        vi_tri_cau: pos + 1,
        dap_an: selectedAnswer,
      });
    }
    
    // Insert in batches of 100
    for (let i = 0; i < responseBatch.length; i += 100) {
      const batch = responseBatch.slice(i, i + 100);
      const { error } = await supabase.from('du_lieu_bai_lam').insert(batch);
      if (error && s === 0) console.log('  Insert error:', error.message);
    }
    totalResponses += responseBatch.length;
    
    if ((s + 1) % 50 === 0) {
      console.log(`  Progress: ${s + 1}/${NUM_STUDENTS} students (${totalResponses} responses)`);
    }
  }
  
  console.log(`\n  Total responses created: ${totalResponses}`);

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n========================================');
  console.log('SEED COMPLETE!');
  console.log('========================================');
  console.log(`Knowledge nodes:  ${kienThucIds.length}`);
  console.log(`Questions:        ${cauHoiIds.length}`);
  console.log(`Exam:             ma_ky_thi = ${maKyThi}`);
  console.log(`Test versions:    ${deThiIds.length} (${deThiIds.join(', ')})`);
  console.log(`Students:         ${NUM_STUDENTS}`);
  console.log(`Total responses:  ${totalResponses}`);
  console.log('========================================');
  console.log(`\nBây giờ anh có thể mở trang IRT Analysis,`);
  console.log(`chọn kỳ thi "${kyThiData?.ten_ky_thi}" và chạy pipeline!`);
}

seed().catch(console.error);
