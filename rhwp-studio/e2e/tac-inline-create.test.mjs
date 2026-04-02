/**
 * E2E 테스트: 빈 문서에서 인라인 TAC 표 직접 생성 (Issue #32)
 *
 * 한컴과 동일한 입력 순서:
 *   1. 텍스트 입력 → 2. 인라인 표 삽입 → 3. 표 뒤에서 계속 입력
 *
 * 논리적 오프셋 체계 사용:
 *   insertTextLogical / getLogicalLength로 컨트롤 포함 위치 지정
 *
 * 실행: node e2e/tac-inline-create.test.mjs [--mode=host|headless]
 */
import {
  runTest, createNewDocument, clickEditArea, screenshot, assert,
  moveCursorTo,
} from './helpers.mjs';

/** 렌더링 갱신 + 대기 */
async function refresh(page) {
  await page.evaluate(() => {
    window.__eventBus?.emit?.('document-changed');
    window.__canvasView?.loadDocument?.();
  });
  await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
}

runTest('인라인 TAC 표 — 한컴 방식 입력', async ({ page }) => {
  // ── Step 0: 빈 문서 ──
  await createNewDocument(page);
  await clickEditArea(page);
  await screenshot(page, 'tac-build-00-blank');
  console.log('  Step 0: 빈 문서');

  // ── Step 1: 제목 입력 ──
  await moveCursorTo(page, 0, 0, 0);
  await page.keyboard.type('TC #20', { delay: 50 });
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  await screenshot(page, 'tac-build-01-title');
  console.log('  Step 1: "TC #20" 입력');

  // ── Step 2: Enter ──
  await page.keyboard.press('Enter');
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  await screenshot(page, 'tac-build-02-enter');
  console.log('  Step 2: Enter (pi=1 생성)');

  // ── Step 3: 표 앞 텍스트 입력 ──
  await page.keyboard.type('tacglkj ', { delay: 50 });
  await page.evaluate(() => new Promise(r => setTimeout(r, 100)));
  await page.keyboard.type('표 3 배치 시작', { delay: 80 });
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  await screenshot(page, 'tac-build-03-before-text');
  console.log('  Step 3: "tacglkj 표 3 배치 시작"');

  // ── Step 4: 인라인 TAC 2×2 표 삽입 ──
  const tableResult = await page.evaluate(() => {
    const w = window.__wasm;
    const textLen = w.doc.getParagraphLength(0, 1);
    const result = JSON.parse(w.doc.createTableEx(JSON.stringify({
      sectionIdx: 0, paraIdx: 1, charOffset: textLen,
      rowCount: 2, colCount: 2,
      treatAsChar: true,
      colWidths: [6777, 6777],
    })));
    return result;
  });
  assert(tableResult.ok, `createTableEx 실패: ${JSON.stringify(tableResult)}`);
  console.log(`  Step 4: 인라인 TAC 표 삽입 → logicalOffset=${tableResult.logicalOffset}`);
  await refresh(page);
  await screenshot(page, 'tac-build-04-table');

  // ── Step 5: 셀 텍스트 입력 ──
  await page.evaluate((ci) => {
    const w = window.__wasm;
    w.doc.insertTextInCell(0, 1, ci, 0, 0, 0, '1');
    w.doc.insertTextInCell(0, 1, ci, 1, 0, 0, '2');
    w.doc.insertTextInCell(0, 1, ci, 2, 0, 0, '3 tacglkj');
    w.doc.insertTextInCell(0, 1, ci, 3, 0, 0, '4 tacglkj');
  }, tableResult.controlIdx);
  await refresh(page);
  await screenshot(page, 'tac-build-05-cell-text');
  console.log('  Step 5: 셀 텍스트 (1, 2, 3 tacglkj, 4 tacglkj)');

  // ── Step 6: 표 뒤에서 텍스트 입력 (insertTextLogical 사용) ──
  const afterResult = await page.evaluate((logOff) => {
    const w = window.__wasm;
    // logicalOffset = 표 바로 뒤 위치
    const result = JSON.parse(w.doc.insertTextLogical(0, 1, logOff, '4 tacglkj 표 다음'));
    return result;
  }, tableResult.logicalOffset);
  console.log(`  Step 6: 표 뒤 텍스트 삽입 → newLogicalOffset=${afterResult.logicalOffset}`);

  // 커서를 표 뒤 텍스트 끝으로 이동
  {
    const textOff = await page.evaluate((logOff) => {
      return window.__wasm.doc.logicalToTextOffset(0, 1, logOff);
    }, afterResult.logicalOffset);
    await moveCursorTo(page, 0, 1, textOff);
  }
  await refresh(page);
  await screenshot(page, 'tac-build-06-after-text');
  console.log('  Step 6: "4 tacglkj 표 다음" (표 뒤에 삽입)');

  // ── Step 7: Enter → pi=2 ──
  await page.keyboard.press('Enter');
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  await screenshot(page, 'tac-build-07-enter2');
  console.log('  Step 7: Enter (pi=2)');

  // ── Step 8: 마지막 줄 ──
  await page.keyboard.type('tacglkj ', { delay: 50 });
  await page.evaluate(() => new Promise(r => setTimeout(r, 100)));
  await page.keyboard.type('가나 옮', { delay: 80 });
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  await screenshot(page, 'tac-build-08-final');
  console.log('  Step 8: "tacglkj 가나 옮"');

  // ── 최종 검증 ──
  const final_ = await page.evaluate(() => {
    const w = window.__wasm;
    const getText = (s, p) => {
      try { return w.doc.getTextRange(s, p, 0, w.doc.getParagraphLength(s, p)); }
      catch { return ''; }
    };
    return {
      pageCount: w.pageCount,
      paraCount: w.getParagraphCount(0),
      pi0: getText(0, 0),
      pi1: getText(0, 1),
      pi2: getText(0, 2),
      pi1LogicalLen: w.doc.getLogicalLength(0, 1),
    };
  });

  console.log(`\n  === 최종 결과 ===`);
  console.log(`  페이지: ${final_.pageCount}, 문단: ${final_.paraCount}`);
  console.log(`  pi=0: "${final_.pi0}"`);
  console.log(`  pi=1: "${final_.pi1}" (논리적 길이: ${final_.pi1LogicalLen})`);
  console.log(`  pi=2: "${final_.pi2}"`);

  assert(final_.pageCount === 1, `1페이지 예상, 실제: ${final_.pageCount}`);
  assert(final_.paraCount >= 3, `3문단 이상 예상, 실제: ${final_.paraCount}`);
  assert(final_.pi1.includes('배치 시작'), `pi=1에 '배치 시작' 포함`);
  assert(final_.pi1.includes('표 다음'), `pi=1에 '표 다음' 포함`);

  // pi=1 텍스트 구조 검증: "배치 시작" 뒤에 "4 tacglkj" (표 뒤 텍스트)
  const idx1 = final_.pi1.indexOf('배치 시작');
  const idx2 = final_.pi1.indexOf('4 tacglkj');
  assert(idx1 < idx2, `'배치 시작'(${idx1})이 '4 tacglkj'(${idx2}) 앞에 있어야 함`);
  console.log('  텍스트 순서 검증 ✓');

  await screenshot(page, 'tac-build-09-verified');
  console.log('\n  인라인 TAC 표 한컴 방식 입력 E2E 완료 ✓');
});
