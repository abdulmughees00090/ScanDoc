/**
 * ScanDoc — Main Application Script
 * Features: OCR, Camera Capture, Translation, DOCX Download
 * Backend: OCI Flask API
 */

// ═══════════════════════════════════════════════════
//  CONFIGURATION — UPDATE THIS WITH YOUR BACKEND URL
// ═══════════════════════════════════════════════════
const CONFIG = {
  BACKEND_URL: 'http://152.70.237.211:5001',   // ⚠️ UPDATE: Replace with your OCI instance public IP
  MAX_IMAGE_SIZE_MB: 10,
  RESIZE_MAX_DIMENSION: 2048,
  JPEG_QUALITY: 0.88,
  DEMO_MODE: false,  // DISABLED - using real backend
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

  if (tab !== 'camera') stopCamera();
  updateProcessButton();
}

if (dom.tabUpload) dom.tabUpload.addEventListener('click', () => switchTab('upload'));
if (dom.tabCamera) dom.tabCamera.addEventListener('click', () => switchTab('camera'));

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
//  MAIN PROCESS — OCR
// ═══════════════════════════════════════════════════
if (dom.processBtn) dom.processBtn.addEventListener('click', runOCR);

function updateProcessButton() {
  const hasImage = state.imageFile || state.capturedBlob;
  if (dom.processBtn) dom.processBtn.disabled = !hasImage || state.isProcessing;
}

async function runOCR() {
  const source = state.imageFile || state.capturedBlob;
  if (!source) return;

  state.isProcessing = true;
  updateProcessButton();
  resetResults();
  showProgressArea();

  try {
    await animateStep(dom.ps1, 0, 20);
    const processedBlob = await preprocessImage(source);

    await animateStep(dom.ps2, 20, 60);
    const text = await performOCR(processedBlob);

    await animateStep(dom.ps3, 60, 85);
    await animateStep(dom.ps4, 85, 100);

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
  const formData = new FormData();
  formData.append('image', imageBlob, 'document.jpg');
  formData.append('lang', dom.ocrLang.value);

  const response = await fetch(`${CONFIG.BACKEND_URL}/api/ocr`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${response.status}`);
  }

  const data = await response.json();
  return data.text || '';
}

// ═══════════════════════════════════════════════════
//  TRANSLATION
// ═══════════════════════════════════════════════════
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
  const response = await fetch(`${CONFIG.BACKEND_URL}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, target: targetLang }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${response.status}`);
  }

  const data = await response.json();
  return data.translated_text || text;
}

if (dom.copyTranslatedBtn) {
  dom.copyTranslatedBtn.addEventListener('click', () => {
    copyToClipboard(dom.translatedText.textContent, 'Translation copied!');
  });
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
    const response = await fetch(`${CONFIG.BACKEND_URL}/api/generate-docx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) throw new Error(`Server error ${response.status}`);

    const blob = await response.blob();
    downloadBlob(blob, 'scandoc_output.docx');
    showToast('Document downloaded!', 'success');
  } catch (err) {
    showToast(`Download failed: ${err.message}. Falling back to .txt`, 'error');
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
  
  console.log('%cScanDoc initialized — Production Mode', 'color:#4CAF50;font-weight:bold;font-size:14px');
  console.log(`Backend URL: ${CONFIG.BACKEND_URL}`);
})();
