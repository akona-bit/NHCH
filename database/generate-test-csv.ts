/**
 * Script tạo file CSV dữ liệu mẫu để test IRT Analysis
 * Tạo 2 file:
 *   - test_responses.csv: Bài làm 150 thí sinh, 30 câu, 4 mã đề
 *   - test_answers.csv: Đáp án đúng cho 4 mã đề
 * 
 * Chạy: npx tsx database/generate-test-csv.ts
 */

import fs from 'fs';
import path from 'path';

const NUM_STUDENTS = 150;
const NUM_QUESTIONS = 30;
const NUM_VERSIONS = 4;
const CHOICES = ['A', 'B', 'C', 'D'];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 1. Tạo đáp án gốc (30 câu, mỗi câu có 1 đáp án đúng)
const baseCorrectAnswers: string[] = [];
for (let i = 0; i < NUM_QUESTIONS; i++) {
  baseCorrectAnswers.push(randomChoice(CHOICES));
}

// 2. Tạo đáp án cho 4 mã đề (xáo trộn thứ tự câu + đáp án)
type VersionMapping = {
  maDe: number;
  questionOrder: number[];         // gốc -> vị trí mới
  answerMapping: Map<number, Map<string, string>>; // câu gốc -> { A->C, B->A, ... }
  correctAnswers: string[];        // đáp án đúng sau xáo trộn
};

const versions: VersionMapping[] = [];

for (let v = 0; v < NUM_VERSIONS; v++) {
  const maDe = 100 + v + 1; // 101, 102, 103, 104
  const questionOrder = shuffle([...Array(NUM_QUESTIONS)].map((_, i) => i));
  const correctAnswers: string[] = [];
  const answerMapping = new Map<number, Map<string, string>>();
  
  for (let pos = 0; pos < NUM_QUESTIONS; pos++) {
    const origIdx = questionOrder[pos];
    const origCorrect = baseCorrectAnswers[origIdx];
    
    // Xáo trộn thứ tự đáp án: A,B,C,D -> shuffled
    const shuffledChoices = shuffle([...CHOICES]);
    const mapping = new Map<string, string>();
    CHOICES.forEach((orig, i) => {
      mapping.set(orig, shuffledChoices[i]);
    });
    
    answerMapping.set(pos, mapping);
    correctAnswers.push(mapping.get(origCorrect)!);
  }
  
  versions.push({ maDe, questionOrder, answerMapping, correctAnswers });
}

// 3. Tạo file đáp án (test_answers.csv)
const ansHeader = ['MaDe', ...Array.from({ length: NUM_QUESTIONS }, (_, i) => `Cau${i + 1}`)];
const ansRows: string[] = [ansHeader.join(',')];

for (const v of versions) {
  const row = [String(v.maDe), ...v.correctAnswers];
  ansRows.push(row.join(','));
}

const answersCsvPath = 'd:/nhch/database/test_answers.csv';
fs.writeFileSync(answersCsvPath, ansRows.join('\n'), 'utf8');
console.log(`Created: ${answersCsvPath}`);

// 4. Tạo file bài làm (test_responses.csv) 
// Simulate students with different ability levels
const resHeader = ['SBD', 'MaDe', 'Gioi', ...Array.from({ length: NUM_QUESTIONS }, (_, i) => `Cau${i + 1}`)];
const resRows: string[] = [resHeader.join(',')];

for (let s = 0; s < NUM_STUDENTS; s++) {
  const sbd = `TS${String(s + 1).padStart(4, '0')}`;
  const version = versions[s % NUM_VERSIONS];
  const gioi = Math.random() > 0.5 ? 'Nam' : 'Nu';
  
  // Student ability: creates a nice distribution
  // Top 25%: 70-90% correct, Mid 50%: 40-65% correct, Bottom 25%: 15-35% correct
  let correctRate: number;
  if (s < NUM_STUDENTS * 0.25) {
    correctRate = 0.70 + Math.random() * 0.20;
  } else if (s < NUM_STUDENTS * 0.75) {
    correctRate = 0.40 + Math.random() * 0.25;
  } else {
    correctRate = 0.15 + Math.random() * 0.20;
  }
  
  // Also make later questions harder (simulating difficulty progression)
  const answers: string[] = [];
  for (let q = 0; q < NUM_QUESTIONS; q++) {
    // 3% chance of blank (leaving empty)
    if (Math.random() < 0.03) {
      answers.push('');
      continue;
    }
    
    // Harder questions have lower correct rate
    const difficultyPenalty = (q / NUM_QUESTIONS) * 0.20;
    const adjustedRate = correctRate - difficultyPenalty;
    
    if (Math.random() < adjustedRate) {
      // Answer correctly
      answers.push(version.correctAnswers[q]);
    } else {
      // Answer incorrectly - pick a wrong answer
      const wrongChoices = CHOICES.filter(c => c !== version.correctAnswers[q]);
      answers.push(randomChoice(wrongChoices));
    }
  }
  
  const row = [sbd, String(version.maDe), gioi, ...answers];
  resRows.push(row.join(','));
}

const responsesCsvPath = 'd:/nhch/database/test_responses.csv';
fs.writeFileSync(responsesCsvPath, resRows.join('\n'), 'utf8');
console.log(`Created: ${responsesCsvPath}`);

// 5. Summary
console.log('\n========================================');
console.log('TEST DATA GENERATED!');
console.log('========================================');
console.log(`Students:    ${NUM_STUDENTS}`);
console.log(`Questions:   ${NUM_QUESTIONS}`);
console.log(`Versions:    ${NUM_VERSIONS} (MaDe: ${versions.map(v => v.maDe).join(', ')})`);
console.log(`\nFiles created:`);
console.log(`  📄 ${responsesCsvPath}`);
console.log(`  📄 ${answersCsvPath}`);
console.log(`\nHướng dẫn sử dụng:`);
console.log(`  1. Mở trang IRT Analysis trên web`);
console.log(`  2. Chọn tab "EXCEL/CSV"`);
console.log(`  3. Upload "test_responses.csv" vào FILE BÀI LÀM`);
console.log(`  4. Upload "test_answers.csv" vào FILE ĐÁP ÁN`);
console.log(`  5. Bấm CONFIRM → INIT_CALIB`);
console.log('========================================');
