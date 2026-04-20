/**
 * ScanDoc — Main Application Script
 * Features: OCR (OCI Backend), Translation (DeepSeek AI + OCI Fallback)
 */

// ═══════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════
const CONFIG = {
  // DeepSeek API Configuration (Translation Only)
  DEEPSEEK_API_KEY: 'YOUR_NEW_SECRET_API_KEY_HERE',  // ← REPLACE WITH YOUR NEW KEY
  DEEPSEEK_API_URL: 'https://api.deepseek.com/v1/chat/completions',
  DEEPSEEK_MODEL: 'deepseek-chat',
  
  // OCI Backend (OCR + Fallback)
  BACKEND_URL: 'https://api.silverfoxdynamics.com/scandoc',
  
  // Image Processing
  MAX_IMAGE_SIZE_MB: 10,
  RESIZE_MAX_DIMENSION: 2048,
  JPEG_QUALITY: 0.88,
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
  usingDeepSeekForTranslation: true,
};

// ═══════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════
function showToast(message, type = 'success') {
  if (!dom.toast) return;
  clearTimeout(window.toastTimeout);
  dom.toast.textContent = message;
  dom.toast.className = `toast show ${type}`;
  window.toastTimeout = setTimeout(() => {
    dom.toast.classList.remove('show');
  }, 3400);
}

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
//  DEEPSEEK TRANSLATION ONLY (No OCR)
// ═══════════════════════════════════════════════════
async function performDeepSeekTranslation(text, targetLang, sourceLang = 'auto') {
  try {
    const languageNames = {
      'es': 'Spanish', 'fr': 'French', 'de': 'German', 'zh': 'Chinese (Simplified)',
      'zh-TW': 'Chinese (Traditional)', 'ja': 'Japanese', 'ko': 'Korean',
      'ar': 'Arabic', 'hi': 'Hindi', 'ru': 'Russian', 'pt': 'Portuguese',
      'it': 'Italian', 'tr': 'Turkish', 'nl': 'Dutch', 'pl': 'Polish',
      'vi': 'Vietnamese', 'th': 'Thai', 'ur': 'Urdu', 'en': 'English'
    };
    
    const targetName = languageNames[targetLang] || targetLang;
    const sourceName = sourceLang === 'auto' ? 'auto-detect' : (languageNames[sourceLang] || sourceLang);
    
    const requestBody = {
      model: CONFIG.DEEPSEEK_MODEL,
      messages: [
        {
          role: "user",
          content: `Translate the following text from ${sourceName} to ${targetName}. 
Preserve the original meaning, tone, and formatting.
Output ONLY the translation, no explanations, no quotes around the output.

Text to translate:
${text.substring(0, 4000)}`
        }
      ],
      max_tokens: 4096,
      temperature: 0.3
    };
    
    const response = await fetch(CONFIG.DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `API error: ${response.status}`);
    }
    
    const data = await response.json();
    let translated = data.choices[0].message.content;
    
    // Clean up any quotes or extra formatting
    translated = translated.replace(/^["']|["']$/g, '');
    
    return translated;
    
  } catch (error) {
    console.error('DeepSeek translation failed:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════
//  OCI FUNCTIONS (OCR + Translation Fallback)
// ═══════════════════════════════════════════════════
async function performOCIOCR(imageBlob) {
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

async function performOCITranslation(text, targetLang) {
  const response = await fetch(`${CONFIG.BACKEND_URL}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      text: text.substring(0, 5000),
      target: targetLang,
      source: 'en'
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${response.status}`);
  }

  const data = await response.json();
  return data.translated_text || text;
}

// ═══════════════════════════════════════════════════
//  MAIN OCR FUNCTION (OCI Only - DeepSeek doesn't support images)
// ═══════════════════════════════════════════════════
async function performOCR(imageBlob) {
  // OCI backend for OCR (DeepSeek doesn't support image input)
  return await performOCIOCR(imageBlob);
}

// ═══════════════════════════════════════════════════
//  MAIN TRANSLATION FUNCTION (DeepSeek + OCI Fallback)
// ═══════════════════════════════════════════════════
async function performTranslation(text, targetLang) {
  // Try DeepSeek first if API key is configured
  if (CONFIG.DEEPSEEK_API_KEY && CONFIG.DEEPSEEK_API_KEY !== 'YOUR_NEW_SECRET_API_KEY_HERE') {
    try {
      state.usingDeepSeekForTranslation = true;
      const translated = await performDeepSeekTranslation(text, targetLang);
      return translated;
    } catch (error) {
      console.warn('DeepSeek translation failed, falling back to OCI:', error);
      showToast('DeepSeek unavailable, using backup translation...', 'info');
    }
  }
  
  // Fallback to OCI
  state.usingDeepSeekForTranslation = false;
  return await performOCITranslation(text, targetLang);
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

    const sourceText = state.usingDeepSeekForTranslation ? 'DeepSeek AI' : 'Standard';
    showToast(`Translation complete! (${sourceText})`, 'success');
  } catch (err) {
    showToast(`Translation failed: ${err.message}`, 'error');
  } finally {
    dom.translateBtn.disabled = false;
    dom.translateBtn.innerHTML = originalText;
  }
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
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>ScanDoc — Extracted Document</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:i/><w:sz w:val="20"/></w:rPr><w:t>Generated on ${new Date().toLocaleString()}</w:t></w:r></w:p>
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
//  INITIALIZATION
// ═══════════════════════════════════════════════════
(function init() {
  if (dom.tabCamera && !navigator.mediaDevices?.getUserMedia) {
    dom.tabCamera.disabled = true;
    dom.tabCamera.title = 'Camera not supported in this browser';
    dom.tabCamera.style.opacity = '0.4';
    dom.tabCamera.style.cursor = 'not-allowed';
  }

  updateProcessButton();
  
  // Check if DeepSeek API key is configured
  const hasDeepSeekKey = CONFIG.DEEPSEEK_API_KEY && CONFIG.DEEPSEEK_API_KEY !== 'YOUR_NEW_SECRET_API_KEY_HERE';
  
  console.log('%cScanDoc initialized — DeepSeek Translation Mode', 'color:#4CAF50;font-weight:bold;font-size:14px');
  console.log(`DeepSeek Translation API: ${hasDeepSeekKey ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`OCI Backend (OCR): ${CONFIG.BACKEND_URL}`);
  
  if (hasDeepSeekKey) {
    showToast('✨ ScanDoc ready! Translation powered by DeepSeek AI', 'success');
  } else {
    showToast('⚠️ ScanDoc ready! Add DeepSeek API key for better translation', 'info');
  }
})();

// ============================================
// PWA Installation - One-Click Shortcut
// ============================================

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

let installPromptShown = false;
window.addEventListener('load', () => {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) {
    if (installBtn) installBtn.style.display = 'none';
    if (mobileInstallBtn) mobileInstallBtn.style.display = 'none';
    return;
  }
  
  setTimeout(() => {
    if (deferredPrompt && !installPromptShown && !isStandalone) {
      installPromptShown = true;
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = '📱 Install ScanDoc as an app for faster access! Click here.';
        toast.classList.add('show', 'install-prompt');
        toast.onclick = () => {
          toast.classList.remove('show');
          if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(() => {
              deferredPrompt = null;
              if (installBtn) installBtn.style.display = 'none';
              if (mobileInstallBtn) mobileInstallBtn.style.display = 'none';
            });
          }
          toast.onclick = null;
        };
        setTimeout(() => {
          toast.classList.remove('show');
          toast.onclick = null;
        }, 8000);
      }
    }
  }, 3000);
});

window.addEventListener('appinstalled', () => {
  console.log('PWA was installed');
  deferredPrompt = null;
  if (installBtn) installBtn.style.display = 'none';
  if (mobileInstallBtn) mobileInstallBtn.style.display = 'none';
  showToast('✅ ScanDoc is now installed on your device!', 'success');
});
