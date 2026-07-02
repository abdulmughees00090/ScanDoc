/**
 * ScanDoc — Main Application Script
 * Features: OCR, Camera Capture, Image/Text ↔ PDF, Translation, DOCX Download
 * Everything runs client-side: Tesseract.js (OCR), PDF.js (PDF read/render),
 * jsPDF (PDF generation), MyMemory (free translation API).
 * Ad Integration: Adsterra (SmartLink on Extract Text button)
 */

// ═══════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════
const CONFIG = {
  MAX_IMAGE_SIZE_MB: 10,
  RESIZE_MAX_DIMENSION: 2048,
  JPEG_QUALITY: 0.88,
};

// ═══════════════════════════════════════════════════
//  OCR ENGINE (Tesseract.js — runs entirely in-browser)
// ═══════════════════════════════════════════════════
// Workers are cached per language combo so re-running OCR with the same
// language doesn't re-download/re-init the WASM engine + traineddata.
const ocrWorkers = {};

async function getOcrWorker(langs) {
  if (ocrWorkers[langs]) return ocrWorkers[langs];
  if (typeof Tesseract === 'undefined') {
    throw new Error('OCR engine failed to load. Check your internet connection and reload the page.');
  }
  const worker = await Tesseract.createWorker(langs, 1, {
    logger: m => onOcrProgress(m),
  });
  ocrWorkers[langs] = worker;
  return worker;
}

// ═══════════════════════════════════════════════════
//  ADSTERRA CONFIGURATION
// ═══════════════════════════════════════════════════
const ADSTERRA = {
  SMART_LINK_URL: 'https://walkingdrunkard.com/i36defv5rp?key=59117978654aca970efc37dd853580d2',
  adShownThisSession: false,
  pendingOCRCallback: null
};

// ═══════════════════════════════════════════════════
//  DOM REFERENCES
// ═══════════════════════════════════════════════════
const $ = id => document.getElementById(id);

const dom = {
  tabUpload: $('tabUpload'),
  tabCamera: $('tabCamera'),
  panelUpload: $('panelUpload'),
  panelCamera: $('panelCamera'),
  dropZone: $('dropZone'),
  dropZoneBody: $('dropZoneBody'),
  fileInput: $('fileInput'),
  imagePreview: $('imagePreview'),
  previewImg: $('previewImg'),
  clearImage: $('clearImage'),
  cameraPlaceholder: $('cameraPlaceholder'),
  cameraVideo: $('cameraVideo'),
  cameraCanvas: $('cameraCanvas'),
  cameraOverlay: $('cameraOverlay'),
  startCameraBtn: $('startCameraBtn'),
  captureCameraBtn: $('captureCameraBtn'),
  stopCameraBtn: $('stopCameraBtn'),
  ocrLang: $('ocrLang'),
  ocrLang2: $('ocrLang2'),
  outputFormat: $('outputFormat'),
  processBtn: $('processBtn'),
  progressArea: $('progressArea'),
  ps1: $('ps1'), ps2: $('ps2'), ps3: $('ps3'), ps4: $('ps4'),
  scanProgressFill: $('scanProgressFill'),
  resultsArea: $('resultsArea'),
  resultsText: $('resultsText'),
  copyBtn: $('copyBtn'),
  clearResultsBtn: $('clearResultsBtn'),
  translateTo: $('translateTo'),
  translateBtn: $('translateBtn'),
  translatedOutput: $('translatedOutput'),
  translatedText: $('translatedText'),
  translatedLangLabel: $('translatedLangLabel'),
  copyTranslatedBtn: $('copyTranslatedBtn'),
  downloadBtn: $('downloadBtn'),
  toast: $('toast'),
  navToggle: $('navToggle'),
  navMobile: $('navMobile'),
};

// ═══════════════════════════════════════════════════
//  APP STATE
// ═══════════════════════════════════════════════════
const state = {
  currentTab: 'upload',
  imageFile: null,
  capturedBlob: null,
  extractedText: '',
  translatedText: '',
  cameraStream: null,
  isProcessing: false,
};

// ═══════════════════════════════════════════════════
//  NAVBAR TOGGLE (mobile)
// ═══════════════════════════════════════════════════
if (dom.navToggle) {
  dom.navToggle.addEventListener('click', () => {
    dom.navMobile.classList.toggle('open');
  });
}

// ═══════════════════════════════════════════════════
//  TAB SWITCHING
// ═══════════════════════════════════════════════════
function switchTab(tab) {
  state.currentTab = tab;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
  });

  const ocrChrome = document.getElementById('ocrChrome');
  if (ocrChrome) ocrChrome.style.display = (tab === 'upload' || tab === 'camera') ? '' : 'none';

  if (tab !== 'camera') stopCamera();
  updateProcessButton();
}

if (dom.tabUpload) dom.tabUpload.addEventListener('click', () => switchTab('upload'));
if (dom.tabCamera) dom.tabCamera.addEventListener('click', () => switchTab('camera'));
const tabImg2pdf = $('tabImg2pdf'), tabTxt2pdf = $('tabTxt2pdf'), tabPdf2img = $('tabPdf2img'), tabPdf2txt = $('tabPdf2txt');
if (tabImg2pdf) tabImg2pdf.addEventListener('click', () => switchTab('img2pdf'));
if (tabTxt2pdf) tabTxt2pdf.addEventListener('click', () => switchTab('txt2pdf'));
if (tabPdf2img) tabPdf2img.addEventListener('click', () => switchTab('pdf2img'));
if (tabPdf2txt) tabPdf2txt.addEventListener('click', () => switchTab('pdf2txt'));

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.js';
}

// ═══════════════════════════════════════════════════
//  FILE UPLOAD / DROP ZONE
// ═══════════════════════════════════════════════════
if (dom.dropZone) {
  dom.dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dom.dropZone.classList.add('dragover');
  });

  dom.dropZone.addEventListener('dragleave', () => {
    dom.dropZone.classList.remove('dragover');
  });

  dom.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dom.dropZone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileSelected(file);
  });
}

if (dom.fileInput) {
  dom.fileInput.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  });
}

if (dom.clearImage) {
  dom.clearImage.addEventListener('click', e => {
    e.stopPropagation();
    clearUploadedImage();
  });
}

function handleFileSelected(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Please upload an image file (JPEG, PNG, WEBP, BMP)', 'error');
    return;
  }

  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > CONFIG.MAX_IMAGE_SIZE_MB) {
    showToast(`Image too large (${sizeMB.toFixed(1)} MB). Max ${CONFIG.MAX_IMAGE_SIZE_MB} MB.`, 'error');
    return;
  }

  state.imageFile = file;
  state.capturedBlob = null;

  const url = URL.createObjectURL(file);
  dom.previewImg.src = url;
  dom.imagePreview.style.display = 'block';
  dom.dropZoneBody.style.display = 'none';

  updateProcessButton();
  resetResults();
}

function clearUploadedImage() {
  state.imageFile = null;
  dom.previewImg.src = '';
  dom.imagePreview.style.display = 'none';
  dom.dropZoneBody.style.display = 'block';
  if (dom.fileInput) dom.fileInput.value = '';
  updateProcessButton();
  resetResults();
}

// ═══════════════════════════════════════════════════
//  CAMERA
// ═══════════════════════════════════════════════════
if (dom.startCameraBtn) dom.startCameraBtn.addEventListener('click', startCamera);
if (dom.captureCameraBtn) dom.captureCameraBtn.addEventListener('click', captureFrame);
if (dom.stopCameraBtn) dom.stopCameraBtn.addEventListener('click', stopCamera);

async function startCamera() {
  try {
    const constraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      }
    };

    state.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    dom.cameraVideo.srcObject = state.cameraStream;
    dom.cameraVideo.style.display = 'block';
    dom.cameraPlaceholder.style.display = 'none';
    dom.cameraOverlay.style.display = 'flex';

    dom.startCameraBtn.style.display = 'none';
    dom.captureCameraBtn.disabled = false;
    dom.stopCameraBtn.style.display = 'inline-flex';

    showToast('Camera started! Point at your document.', 'success');
  } catch (err) {
    let message = 'Camera access denied.';
    if (err.name === 'NotFoundError') message = 'No camera found on this device.';
    if (err.name === 'NotAllowedError') message = 'Camera permission denied. Please allow access in browser settings.';
    showToast(message, 'error');
  }
}

function captureFrame() {
  if (!state.cameraStream) return;

  const video = dom.cameraVideo;
  const canvas = dom.cameraCanvas;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(blob => {
    state.capturedBlob = blob;
    state.imageFile = null;

    const url = URL.createObjectURL(blob);
    dom.previewImg.src = url;
    dom.imagePreview.style.display = 'block';
    dom.dropZoneBody.style.display = 'none';

    stopCamera();
    switchTab('upload');
    updateProcessButton();
    resetResults();

    showToast('Frame captured! Ready to extract.', 'success');
  }, 'image/jpeg', 0.95);
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  dom.cameraVideo.srcObject = null;
  dom.cameraVideo.style.display = 'none';
  dom.cameraPlaceholder.style.display = 'block';
  dom.cameraOverlay.style.display = 'none';

  dom.startCameraBtn.style.display = 'inline-flex';
  dom.captureCameraBtn.disabled = true;
  dom.stopCameraBtn.style.display = 'none';
}

// ═══════════════════════════════════════════════════
//  IMAGE PREPROCESSING
// ═══════════════════════════════════════════════════
async function preprocessImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = source instanceof Blob ? URL.createObjectURL(source) : URL.createObjectURL(source);

    img.onload = () => {
      let { width, height } = img;
      const max = CONFIG.RESIZE_MAX_DIMENSION;

      if (width > max || height > max) {
        const ratio = Math.min(max / width, max / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.filter = 'contrast(1.1) brightness(1.02)';
      ctx.drawImage(img, 0, 0, width, height);

      URL.revokeObjectURL(url);

      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('Image compression failed')); return; }
        resolve(blob);
      }, 'image/jpeg', CONFIG.JPEG_QUALITY);
    };

    img.onerror = () => reject(new Error('Image load failed'));
    img.src = url;
  });
}

// ═══════════════════════════════════════════════════
//  ADSTERRA SMARTLINK - Show ad before OCR
// ═══════════════════════════════════════════════════
async function showAdsterraSmartLink() {
  return new Promise((resolve) => {
    // If ad already shown this session, resolve immediately
    if (ADSTERRA.adShownThisSession) {
      resolve(true);
      return;
    }

    try {
      // Open SmartLink in new tab
      const adWindow = window.open(ADSTERRA.SMART_LINK_URL, '_blank');
      
      if (adWindow) {
        showToast('📢 Please check the new tab, then return to continue OCR', 'info');
        
        // Wait for user to return to the page
        const onFocus = () => {
          window.removeEventListener('focus', onFocus);
          ADSTERRA.adShownThisSession = true;
          showToast('✅ Thanks! Continuing with text extraction...', 'success');
          resolve(true);
        };
        
        window.addEventListener('focus', onFocus, { once: true });
        
        // Fallback timeout (8 seconds) in case focus event doesn't fire
        setTimeout(() => {
          if (!ADSTERRA.adShownThisSession) {
            window.removeEventListener('focus', onFocus);
            ADSTERRA.adShownThisSession = true;
            resolve(true);
          }
        }, 8000);
      } else {
        // Popup blocked - just continue
        console.warn('Adsterra popup blocked, continuing without ad');
        ADSTERRA.adShownThisSession = true;
        resolve(false);
      }
    } catch (err) {
      console.error('Adsterra error:', err);
      ADSTERRA.adShownThisSession = true;
      resolve(false);
    }
  });
}

// ═══════════════════════════════════════════════════
//  MAIN PROCESS — OCR (with Adsterra integration)
// ═══════════════════════════════════════════════════
if (dom.processBtn) {
  dom.processBtn.addEventListener('click', async () => {
    const source = state.imageFile || state.capturedBlob;
    if (!source) {
      showToast('Please select or capture an image first', 'error');
      return;
    }
    
    if (state.isProcessing) return;
    
    // Show Adsterra SmartLink before processing (only first time per session)
    await showAdsterraSmartLink();
    
    // Proceed with OCR
    runOCR();
  });
}

function updateProcessButton() {
  const hasImage = state.imageFile || state.capturedBlob;
  if (dom.processBtn) dom.processBtn.disabled = !hasImage || state.isProcessing;
}

let ocrProgressPct = 0;
function onOcrProgress(m) {
  // Tesseract.js reports several phases; 'recognizing text' is the bulk of the work.
  if (!dom.scanProgressFill) return;
  let pct = 20; // baseline after preprocessing
  if (m.status === 'loading tesseract core' || m.status === 'initializing tesseract') pct = 25;
  else if (m.status === 'loading language traineddata' || m.status === 'initialized tesseract') pct = 30;
  else if (m.status === 'recognizing text') pct = 30 + Math.round((m.progress || 0) * 55); // 30 → 85
  ocrProgressPct = Math.max(ocrProgressPct, pct);
  dom.scanProgressFill.style.width = `${ocrProgressPct}%`;
  if (m.status === 'recognizing text' && dom.ps2) {
    dom.ps2.classList.add('active');
  }
}

async function runOCR() {
  const source = state.imageFile || state.capturedBlob;
  if (!source) return;

  state.isProcessing = true;
  updateProcessButton();
  resetResults();
  showProgressArea();
  ocrProgressPct = 0;

  try {
    await animateStep(dom.ps1, 0, 20);
    const processedBlob = await preprocessImage(source);

    dom.ps2 && dom.ps2.classList.add('active');
    const text = await performOCR(processedBlob);

    await animateStep(dom.ps3, 85, 92);
    await animateStep(dom.ps4, 92, 100);

    if (!text || !text.trim()) {
      throw new Error('No readable text was found in this image. Try a clearer photo or a different source language.');
    }

    state.extractedText = text;
    dom.resultsText.value = text;

    hideProgressArea();
    showResults();
    showToast('Text extracted successfully!', 'success');
  } catch (err) {
    hideProgressArea();
    showToast(`Error: ${err.message}`, 'error');
    console.error('OCR Error:', err);
  } finally {
    state.isProcessing = false;
    updateProcessButton();
  }
}

async function performOCR(imageBlob) {
  const primary = dom.ocrLang?.value || 'eng';
  const secondary = dom.ocrLang2?.value || '';
  const langs = secondary && secondary !== primary ? `${primary}+${secondary}` : primary;

  let worker;
  try {
    worker = await getOcrWorker(langs);
  } catch (err) {
    throw new Error(err.message || 'Could not start the OCR engine.');
  }

  try {
    const { data } = await worker.recognize(imageBlob);
    return (data?.text || '').trim();
  } catch (err) {
    console.error('Tesseract recognition error:', err);
    throw new Error('OCR failed to process this image. It may be corrupted or in an unsupported format.');
  }
}

// ═══════════════════════════════════════════════════
//  TRANSLATION (MyMemory — free, no API key, ~5000 words/day per IP)
// ═══════════════════════════════════════════════════
const TESS_TO_ISO639_1 = {
  eng: 'en', ara: 'ar', urd: 'ur', fas: 'fa', hin: 'hi', pan: 'pa', ben: 'bn', tam: 'ta', tel: 'te',
  chi_sim: 'zh-CN', chi_tra: 'zh-TW', jpn: 'ja', kor: 'ko', rus: 'ru', fra: 'fr', deu: 'de', spa: 'es',
  por: 'pt', ita: 'it', tur: 'tr', ind: 'id', tha: 'th', vie: 'vi', nld: 'nl', pol: 'pl', ukr: 'uk', ell: 'el', heb: 'he',
};

function chunkTextForTranslation(text, maxLen = 450) {
  const lines = text.split('\n');
  const chunks = [];
  let current = [];
  let currentLen = 0;
  for (const line of lines) {
    if (line.length > maxLen) {
      if (current.length) { chunks.push(current.join('\n')); current = []; currentLen = 0; }
      for (let i = 0; i < line.length; i += maxLen) chunks.push(line.slice(i, i + maxLen));
      continue;
    }
    if (currentLen + line.length + 1 > maxLen && current.length) {
      chunks.push(current.join('\n'));
      current = []; currentLen = 0;
    }
    current.push(line);
    currentLen += line.length + 1;
  }
  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}

if (dom.translateBtn) dom.translateBtn.addEventListener('click', runTranslate);

async function runTranslate() {
  const text = dom.resultsText.value.trim();
  if (!text) { showToast('No text to translate.', 'error'); return; }

  const targetLang = dom.translateTo.value;
  if (!targetLang) { showToast('Please select a target language.', 'error'); return; }

  const originalText = dom.translateBtn.innerHTML;
  dom.translateBtn.disabled = true;
  dom.translateBtn.innerHTML = `<span class="btn-spinner"></span> Translating…`;

  try {
    const translated = await performTranslation(text, targetLang);
    state.translatedText = translated;

    const langName = dom.translateTo.options[dom.translateTo.selectedIndex].text;
    dom.translatedLangLabel.textContent = `→ ${langName}`;
    dom.translatedText.textContent = translated;
    dom.translatedOutput.style.display = 'block';

    showToast('Translation complete!', 'success');
  } catch (err) {
    showToast(`Translation failed: ${err.message}`, 'error');
  } finally {
    dom.translateBtn.disabled = false;
    dom.translateBtn.innerHTML = originalText;
  }
}

async function performTranslation(text, targetLang) {
  const sourceLang = TESS_TO_ISO639_1[dom.ocrLang?.value] || 'en';
  if (sourceLang === targetLang) {
    throw new Error('Source and target languages are the same.');
  }

  const chunks = chunkTextForTranslation(text);
  const translated = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk.trim()) { translated.push(chunk); continue; }

    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${sourceLang}|${targetLang}`;
    let response;
    try {
      response = await fetch(url);
    } catch {
      throw new Error('Could not reach the translation service. Check your internet connection.');
    }

    if (!response.ok) throw new Error(`Translation service error (${response.status})`);
    const data = await response.json();

    if (data.responseStatus && Number(data.responseStatus) !== 200) {
      throw new Error(data.responseDetails || 'Daily free translation limit reached. Try again tomorrow or with shorter text.');
    }

    translated.push(data.responseData?.translatedText || chunk);
    if (i < chunks.length - 1) await sleep(200); // stay polite to the free API's rate limit
  }

  return translated.join('\n');
}

// ═══════════════════════════════════════════════════
//  DOCUMENT DOWNLOAD
// ═══════════════════════════════════════════════════
if (dom.downloadBtn) dom.downloadBtn.addEventListener('click', downloadDocument);

async function downloadDocument() {
  const text = dom.resultsText.value.trim();
  if (!text) { showToast('Nothing to download.', 'error'); return; }

  const format = dom.outputFormat.value;

  if (format === 'txt') {
    downloadTxt(text);
    return;
  }

  const originalText = dom.downloadBtn.innerHTML;
  dom.downloadBtn.disabled = true;
  dom.downloadBtn.innerHTML = `<span class="btn-spinner"></span> Generating…`;

  try {
    const blob = await generateDocxClientSide(text);
    downloadBlob(blob, 'scandoc_output.docx');
    showToast('Document downloaded!', 'success');
  } catch (err) {
    console.error('DOCX generation error:', err);
    showToast(`DOCX generation failed: ${err.message}. Falling back to .txt`, 'error');
    downloadTxt(text);
  } finally {
    dom.downloadBtn.disabled = false;
    dom.downloadBtn.innerHTML = originalText;
  }
}

async function generateDocxClientSide(text) {
  if (typeof JSZip === 'undefined') {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  }

  const zip = new JSZip();

  const escapeXml = s => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const paragraphs = text.split('\n').map(line => {
    if (line.trim() === '') {
      return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>`;
    }
    return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`;
  }).join('\n');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>ScanDoc — Extracted Document</w:t></w:r></w:p>
    <w:p><w:r><w:t>Generated on ${new Date().toLocaleString()}</w:t></w:r></w:p>
    <w:p/>
    ${paragraphs}
  </w:body>
</w:document>`;

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return blob;
}

function downloadTxt(text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, 'scandoc_output.txt');
  showToast('Text file downloaded!', 'success');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════
//  CLIPBOARD COPY
// ═══════════════════════════════════════════════════
if (dom.copyBtn) {
  dom.copyBtn.addEventListener('click', () => {
    copyToClipboard(dom.resultsText.value, 'Text copied to clipboard!');
  });
}

if (dom.copyTranslatedBtn) {
  dom.copyTranslatedBtn.addEventListener('click', () => {
    copyToClipboard(dom.translatedText.textContent, 'Translation copied!');
  });
}

async function copyToClipboard(text, successMsg = 'Copied!') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg, 'success');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(successMsg, 'success');
  }
}

// ═══════════════════════════════════════════════════
//  PROGRESS ANIMATION
// ═══════════════════════════════════════════════════
function showProgressArea() {
  if (!dom.progressArea) return;
  dom.progressArea.style.display = 'block';
  [dom.ps1, dom.ps2, dom.ps3, dom.ps4].forEach(p => {
    if (p) p.classList.remove('active', 'done');
  });
  if (dom.scanProgressFill) dom.scanProgressFill.style.width = '0%';
}

function hideProgressArea() {
  setTimeout(() => { if (dom.progressArea) dom.progressArea.style.display = 'none'; }, 600);
}

function animateStep(stepEl, fromPct, toPct) {
  return new Promise(resolve => {
    if (!stepEl || !dom.scanProgressFill) { resolve(); return; }
    
    const allSteps = [dom.ps1, dom.ps2, dom.ps3, dom.ps4];
    const idx = allSteps.indexOf(stepEl);
    allSteps.forEach((el, i) => {
      if (el && i < idx) { el.classList.remove('active'); el.classList.add('done'); }
    });

    stepEl.classList.add('active');

    const duration = 600;
    const start = performance.now();
    const startPct = parseFloat(dom.scanProgressFill.style.width) || fromPct;

    function frame(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      if (dom.scanProgressFill) {
        dom.scanProgressFill.style.width = `${startPct + (toPct - startPct) * eased}%`;
      }
      if (progress < 1) requestAnimationFrame(frame);
      else resolve();
    }

    requestAnimationFrame(frame);
  });
}

// ═══════════════════════════════════════════════════
//  RESULTS UI
// ═══════════════════════════════════════════════════
function showResults() {
  if (!dom.resultsArea) return;
  dom.resultsArea.style.display = 'block';
  setTimeout(() => {
    dom.resultsArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

function resetResults() {
  if (dom.resultsArea) dom.resultsArea.style.display = 'none';
  if (dom.resultsText) dom.resultsText.value = '';
  if (dom.translatedOutput) dom.translatedOutput.style.display = 'none';
  if (dom.translatedText) dom.translatedText.textContent = '';
  state.extractedText = '';
  state.translatedText = '';
}

if (dom.clearResultsBtn) {
  dom.clearResultsBtn.addEventListener('click', () => {
    resetResults();
    showToast('Results cleared.', 'success');
  });
}

// ═══════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════
let toastTimeout;
function showToast(message, type = 'success') {
  if (!dom.toast) return;
  clearTimeout(toastTimeout);
  dom.toast.textContent = message;
  dom.toast.className = `toast show ${type}`;
  toastTimeout = setTimeout(() => {
    dom.toast.classList.remove('show');
  }, 3400);
}

// ═══════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

// ═══════════════════════════════════════════════════
//  PDF TOOL HELPERS
// ═══════════════════════════════════════════════════
function parsePageRange(str, totalPages) {
  if (!str || !str.trim() || str.trim().toLowerCase() === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set();
  str.split(',').forEach(part => {
    part = part.trim();
    if (!part) return;
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(n => parseInt(n.trim(), 10));
      if (Number.isFinite(a) && Number.isFinite(b)) {
        for (let i = Math.max(1, a); i <= Math.min(totalPages, b); i++) pages.add(i);
      }
    } else {
      const n = parseInt(part, 10);
      if (Number.isFinite(n) && n >= 1 && n <= totalPages) pages.add(n);
    }
  });
  return [...pages].sort((a, b) => a - b);
}

function requireLib(name, obj) {
  if (typeof obj === 'undefined') {
    showToast(`${name} failed to load. Check your internet connection and reload the page.`, 'error');
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════
//  IMAGE → PDF
// ═══════════════════════════════════════════════════
const i2pState = { images: [] }; // { file, url }

const i2pDropZone = $('i2pDropZone'), i2pFileInput = $('i2pFileInput'), i2pList = $('i2pList'), i2pGenerateBtn = $('i2pGenerateBtn');

if (i2pDropZone) {
  i2pDropZone.addEventListener('click', () => i2pFileInput?.click());
  i2pDropZone.addEventListener('dragover', e => { e.preventDefault(); i2pDropZone.classList.add('dragover'); });
  i2pDropZone.addEventListener('dragleave', () => i2pDropZone.classList.remove('dragover'));
  i2pDropZone.addEventListener('drop', e => {
    e.preventDefault();
    i2pDropZone.classList.remove('dragover');
    addI2pFiles(e.dataTransfer?.files);
  });
}
if (i2pFileInput) {
  i2pFileInput.addEventListener('click', e => e.stopPropagation());
  i2pFileInput.addEventListener('change', e => addI2pFiles(e.target.files));
}

function addI2pFiles(fileList) {
  if (!fileList) return;
  [...fileList].forEach(file => {
    if (!file.type.startsWith('image/')) return;
    i2pState.images.push({ file, url: URL.createObjectURL(file) });
  });
  renderI2pList();
}

function renderI2pList() {
  if (!i2pList) return;
  i2pList.innerHTML = '';
  i2pState.images.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'i2p-item';
    div.innerHTML = `
      <img src="${item.url}" alt="Page ${idx + 1}" />
      <div class="i2p-item__label">Page ${idx + 1}</div>
      <div class="i2p-item__controls">
        <button data-act="up" title="Move up">↑</button>
        <button data-act="down" title="Move down">↓</button>
        <button data-act="remove" class="i2p-item__remove" title="Remove">✕</button>
      </div>`;
    div.querySelector('[data-act="up"]').addEventListener('click', () => { if (idx > 0) { [i2pState.images[idx-1], i2pState.images[idx]] = [i2pState.images[idx], i2pState.images[idx-1]]; renderI2pList(); } });
    div.querySelector('[data-act="down"]').addEventListener('click', () => { if (idx < i2pState.images.length - 1) { [i2pState.images[idx+1], i2pState.images[idx]] = [i2pState.images[idx], i2pState.images[idx+1]]; renderI2pList(); } });
    div.querySelector('[data-act="remove"]').addEventListener('click', () => { URL.revokeObjectURL(item.url); i2pState.images.splice(idx, 1); renderI2pList(); });
    i2pList.appendChild(div);
  });
  if (i2pGenerateBtn) i2pGenerateBtn.disabled = i2pState.images.length === 0;
}

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

if (i2pGenerateBtn) {
  i2pGenerateBtn.addEventListener('click', async () => {
    if (!requireLib('jsPDF', window.jspdf)) return;
    if (i2pState.images.length === 0) return;

    const pageSizeMode = $('i2pPageSize').value;
    const margin = parseInt($('i2pMargin').value, 10);
    const quality = parseFloat($('i2pQuality').value);

    i2pGenerateBtn.disabled = true;
    const originalLabel = i2pGenerateBtn.textContent;
    i2pGenerateBtn.textContent = 'Generating…';

    try {
      const { jsPDF } = window.jspdf;
      const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
      let doc = null;

      for (let i = 0; i < i2pState.images.length; i++) {
        const img = await loadImageEl(i2pState.images[i].url);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        let pageW, pageH, drawW, drawH, x, y;
        if (pageSizeMode === 'original') {
          pageW = img.naturalWidth; pageH = img.naturalHeight;
          drawW = pageW; drawH = pageH; x = 0; y = 0;
        } else {
          [pageW, pageH] = PAGE_SIZES[pageSizeMode];
          const availW = pageW - margin * 2, availH = pageH - margin * 2;
          const ratio = Math.min(availW / img.naturalWidth, availH / img.naturalHeight);
          drawW = img.naturalWidth * ratio;
          drawH = img.naturalHeight * ratio;
          x = margin + (availW - drawW) / 2;
          y = margin + (availH - drawH) / 2;
        }

        if (!doc) {
          doc = new jsPDF({ unit: 'pt', format: [pageW, pageH] });
        } else {
          doc.addPage([pageW, pageH]);
        }
        doc.addImage(dataUrl, 'JPEG', x, y, drawW, drawH);
      }

      doc.save('scandoc_images.pdf');
      showToast('PDF generated!', 'success');
    } catch (err) {
      console.error('Image→PDF error:', err);
      showToast(`Failed to generate PDF: ${err.message}`, 'error');
    } finally {
      i2pGenerateBtn.disabled = false;
      i2pGenerateBtn.textContent = originalLabel;
    }
  });
}

// ═══════════════════════════════════════════════════
//  TEXT → PDF
// ═══════════════════════════════════════════════════
const t2pGenerateBtn = $('t2pGenerateBtn');
if (t2pGenerateBtn) {
  t2pGenerateBtn.addEventListener('click', () => {
    if (!requireLib('jsPDF', window.jspdf)) return;
    const text = $('t2pText').value;
    if (!text.trim()) { showToast('Please enter some text first.', 'error'); return; }

    try {
      const { jsPDF } = window.jspdf;
      const font = $('t2pFont').value;
      const size = parseInt($('t2pSize').value, 10);
      const align = $('t2pAlign').value;
      const margin = parseInt($('t2pMargin').value, 10);

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const maxWidth = pageW - margin * 2;
      const lineHeight = size * 1.4;

      doc.setFont(font, 'normal');
      doc.setFontSize(size);

      let y = margin;
      const paragraphs = text.split('\n');
      paragraphs.forEach(paragraph => {
        const lines = paragraph.trim() === '' ? [''] : doc.splitTextToSize(paragraph, maxWidth);
        lines.forEach(line => {
          if (y > pageH - margin) { doc.addPage(); y = margin; }
          const xPos = align === 'center' ? pageW / 2 : margin;
          if (line) doc.text(line, xPos, y, { align: align === 'justify' ? 'left' : align, maxWidth: align === 'justify' ? maxWidth : undefined });
          y += lineHeight;
        });
      });

      doc.save('scandoc_text.pdf');
      showToast('PDF generated!', 'success');
    } catch (err) {
      console.error('Text→PDF error:', err);
      showToast(`Failed to generate PDF: ${err.message}`, 'error');
    }
  });
}

// ═══════════════════════════════════════════════════
//  PDF → IMAGES
// ═══════════════════════════════════════════════════
const p2iDropZone = $('p2iDropZone'), p2iFileInput = $('p2iFileInput'), p2iConvertBtn = $('p2iConvertBtn');
let p2iFile = null;

if (p2iDropZone) {
  p2iDropZone.addEventListener('click', () => p2iFileInput?.click());
  p2iDropZone.addEventListener('dragover', e => { e.preventDefault(); p2iDropZone.classList.add('dragover'); });
  p2iDropZone.addEventListener('dragleave', () => p2iDropZone.classList.remove('dragover'));
  p2iDropZone.addEventListener('drop', e => { e.preventDefault(); p2iDropZone.classList.remove('dragover'); setP2iFile(e.dataTransfer?.files?.[0]); });
}
if (p2iFileInput) {
  p2iFileInput.addEventListener('click', e => e.stopPropagation());
  p2iFileInput.addEventListener('change', e => setP2iFile(e.target.files?.[0]));
}
function setP2iFile(file) {
  if (!file || file.type !== 'application/pdf') { if (file) showToast('Please select a PDF file.', 'error'); return; }
  p2iFile = file;
  const nameEl = $('p2iFileName');
  if (nameEl) { nameEl.textContent = `Selected: ${file.name}`; nameEl.style.display = 'block'; }
  if (p2iConvertBtn) p2iConvertBtn.disabled = false;
}

if (p2iConvertBtn) {
  p2iConvertBtn.addEventListener('click', async () => {
    if (!requireLib('PDF.js', window.pdfjsLib)) return;
    if (!p2iFile) return;

    const format = $('p2iFormat').value;
    const scale = parseFloat($('p2iScale').value);
    const pageRangeStr = $('p2iPages').value;
    const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    const ext = format === 'jpeg' ? 'jpg' : format;

    const resultsEl = $('p2iResults'), progressArea = $('p2iProgressArea'), progressFill = $('p2iProgressFill');
    resultsEl.innerHTML = '';
    progressArea.style.display = 'block';
    progressFill.style.width = '0%';
    p2iConvertBtn.disabled = true;

    try {
      const arrayBuffer = await p2iFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pageNums = parsePageRange(pageRangeStr, pdf.numPages);
      if (pageNums.length === 0) throw new Error('No valid pages selected.');

      const blobs = [];
      for (let i = 0; i < pageNums.length; i++) {
        const pageNum = pageNums[i];
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, 0.92));
        blobs.push({ pageNum, blob });

        const url = URL.createObjectURL(blob);
        const item = document.createElement('div');
        item.className = 'i2p-item';
        item.innerHTML = `<img src="${url}" alt="Page ${pageNum}" /><div class="i2p-item__label">Page ${pageNum}</div><a class="i2p-download" href="${url}" download="page_${pageNum}.${ext}">Download</a>`;
        resultsEl.appendChild(item);

        progressFill.style.width = `${Math.round(((i + 1) / pageNums.length) * 100)}%`;
      }

      if (blobs.length > 1 && requireLib('JSZip', window.JSZip)) {
        const zip = new JSZip();
        blobs.forEach(({ pageNum, blob }) => zip.file(`page_${pageNum}.${ext}`, blob));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(zipBlob, 'scandoc_pages.zip');
      }

      showToast(`Converted ${blobs.length} page(s)!`, 'success');
    } catch (err) {
      console.error('PDF→Images error:', err);
      showToast(`Conversion failed: ${err.message}`, 'error');
    } finally {
      setTimeout(() => { progressArea.style.display = 'none'; }, 500);
      p2iConvertBtn.disabled = false;
    }
  });
}

// ═══════════════════════════════════════════════════
//  PDF → TEXT (with automatic OCR fallback for scanned pages)
// ═══════════════════════════════════════════════════
const p2tDropZone = $('p2tDropZone'), p2tFileInput = $('p2tFileInput'), p2tExtractBtn = $('p2tExtractBtn');
let p2tFile = null;

if (p2tDropZone) {
  p2tDropZone.addEventListener('click', () => p2tFileInput?.click());
  p2tDropZone.addEventListener('dragover', e => { e.preventDefault(); p2tDropZone.classList.add('dragover'); });
  p2tDropZone.addEventListener('dragleave', () => p2tDropZone.classList.remove('dragover'));
  p2tDropZone.addEventListener('drop', e => { e.preventDefault(); p2tDropZone.classList.remove('dragover'); setP2tFile(e.dataTransfer?.files?.[0]); });
}
if (p2tFileInput) {
  p2tFileInput.addEventListener('click', e => e.stopPropagation());
  p2tFileInput.addEventListener('change', e => setP2tFile(e.target.files?.[0]));
}
function setP2tFile(file) {
  if (!file || file.type !== 'application/pdf') { if (file) showToast('Please select a PDF file.', 'error'); return; }
  p2tFile = file;
  const nameEl = $('p2tFileName');
  if (nameEl) { nameEl.textContent = `Selected: ${file.name}`; nameEl.style.display = 'block'; }
  if (p2tExtractBtn) p2tExtractBtn.disabled = false;
}

if (p2tExtractBtn) {
  p2tExtractBtn.addEventListener('click', async () => {
    if (!requireLib('PDF.js', window.pdfjsLib)) return;
    if (!p2tFile) return;

    const progressArea = $('p2tProgressArea'), progressFill = $('p2tProgressFill'), statusEl = $('p2tStatus');
    const resultsArea = $('p2tResultsArea'), resultsText = $('p2tResultsText');
    resultsArea.style.display = 'none';
    progressArea.style.display = 'block';
    progressFill.style.width = '0%';
    p2tExtractBtn.disabled = true;

    try {
      const arrayBuffer = await p2tFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const ocrLang = dom.ocrLang?.value || 'eng';
      let fullText = '';

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        statusEl.textContent = `Reading page ${pageNum} of ${pdf.numPages}…`;
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ').trim();

        if (pageText) {
          fullText += pageText + '\n\n';
        } else {
          // No embedded text layer — this page is a scanned image. OCR it automatically.
          statusEl.textContent = `Page ${pageNum} has no text layer — running OCR…`;
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
          const worker = await getOcrWorker(ocrLang);
          const { data } = await worker.recognize(blob);
          fullText += (data?.text || '').trim() + '\n\n';
        }

        progressFill.style.width = `${Math.round((pageNum / pdf.numPages) * 100)}%`;
      }

      resultsText.value = fullText.trim() || '(No text could be extracted from this PDF.)';
      resultsArea.style.display = 'block';
      showToast('Text extracted!', 'success');
    } catch (err) {
      console.error('PDF→Text error:', err);
      showToast(`Extraction failed: ${err.message}`, 'error');
    } finally {
      progressArea.style.display = 'none';
      p2tExtractBtn.disabled = false;
    }
  });
}

const p2tCopyBtn = $('p2tCopyBtn'), p2tDownloadBtn = $('p2tDownloadBtn');
if (p2tCopyBtn) p2tCopyBtn.addEventListener('click', () => copyToClipboard($('p2tResultsText').value, 'Text copied!'));
if (p2tDownloadBtn) p2tDownloadBtn.addEventListener('click', () => downloadTxt($('p2tResultsText').value));

// ═══════════════════════════════════════════════════
//  PWA INSTALLATION
// ═══════════════════════════════════════════════════
let deferredPrompt = null;
const installBtn = document.getElementById('installPwaBtn');
const mobileInstallBtn = document.getElementById('mobileInstallBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.style.display = 'inline-flex';
  if (mobileInstallBtn) mobileInstallBtn.style.display = 'flex';
  console.log('PWA installation is available');
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) {
      showToast('App is already installed or your browser doesn\'t support PWA installation', 'info');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (installBtn) installBtn.style.display = 'none';
    if (mobileInstallBtn) mobileInstallBtn.style.display = 'none';
    if (outcome === 'accepted') {
      showToast('🎉 ScanDoc installed successfully!', 'success');
    }
  });
}

if (mobileInstallBtn) {
  mobileInstallBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!deferredPrompt) {
      showToast('Open Chrome/Safari menu and tap "Add to Home Screen" to install ScanDoc', 'info');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (installBtn) installBtn.style.display = 'none';
    if (mobileInstallBtn) mobileInstallBtn.style.display = 'none';
    if (outcome === 'accepted') {
      showToast('🎉 ScanDoc installed successfully!', 'success');
    }
  });
}

window.addEventListener('load', () => {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) {
    if (installBtn) installBtn.style.display = 'none';
    if (mobileInstallBtn) mobileInstallBtn.style.display = 'none';
  }
});

window.addEventListener('appinstalled', () => {
  console.log('PWA was installed');
  deferredPrompt = null;
  if (installBtn) installBtn.style.display = 'none';
  if (mobileInstallBtn) mobileInstallBtn.style.display = 'none';
  showToast('✅ ScanDoc is now installed on your device!', 'success');
});

// ═══════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════
(function init() {
  if (dom.tabCamera && !navigator.mediaDevices?.getUserMedia) {
    dom.tabCamera.disabled = true;
    dom.tabCamera.title = 'Camera not supported in this browser';
    dom.tabCamera.style.opacity = '0.4';
    dom.tabCamera.style.cursor = 'not-allowed';
  }

  updateProcessButton();
  
  console.log('%cScanDoc initialized — OCR runs 100% in-browser via Tesseract.js ✅', 'color:#4CAF50;font-weight:bold;font-size:14px');
})();
