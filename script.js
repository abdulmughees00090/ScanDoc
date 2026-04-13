/**
 * ScanDoc — Main Application
 * Backend: OCI Flask API on port 5001
 */

// ============================================================
// CONFIGURATION — UPDATE WITH YOUR OCI PUBLIC IP
// ============================================================
const CONFIG = {
  BACKEND_URL: 'http://139.185.61.225:5001',  // ← UPDATE THIS with your OCI IP
  MAX_IMAGE_SIZE_MB: 10,
  RESIZE_MAX_DIMENSION: 2048,
  JPEG_QUALITY: 0.85,
  DEMO_MODE: false,  // Set to false when backend is ready
};

// ============================================================
// DOM Elements
// ============================================================
const $ = id => document.getElementById(id);

const dom = {
  // Tabs
  tabUpload: $('tabUpload'),
  tabCamera: $('tabCamera'),
  panelUpload: $('panelUpload'),
  panelCamera: $('panelCamera'),
  
  // Upload
  dropZone: $('dropZone'),
  dropZoneBody: $('dropZoneBody'),
  fileInput: $('fileInput'),
  imagePreview: $('imagePreview'),
  previewImg: $('previewImg'),
  clearImage: $('clearImage'),
  
  // Camera
  cameraPlaceholder: $('cameraPlaceholder'),
  cameraVideo: $('cameraVideo'),
  cameraCanvas: $('cameraCanvas'),
  startCameraBtn: $('startCameraBtn'),
  captureCameraBtn: $('captureCameraBtn'),
  stopCameraBtn: $('stopCameraBtn'),
  
  // Options
  ocrLang: $('ocrLang'),
  outputFormat: $('outputFormat'),
  
  // Process
  processBtn: $('processBtn'),
  
  // Progress
  progressArea: $('progressArea'),
  step1: $('step1'),
  step2: $('step2'),
  step3: $('step3'),
  step4: $('step4'),
  progressFill: $('progressFill'),
  
  // Results
  resultsArea: $('resultsArea'),
  resultsText: $('resultsText'),
  copyBtn: $('copyBtn'),
  clearResultsBtn: $('clearResultsBtn'),
  
  // Translate
  translateTo: $('translateTo'),
  translateBtn: $('translateBtn'),
  translatedOutput: $('translatedOutput'),
  translatedText: $('translatedText'),
  translatedLangLabel: $('translatedLangLabel'),
  copyTranslatedBtn: $('copyTranslatedBtn'),
  
  // Download
  downloadBtn: $('downloadBtn'),
  
  // Misc
  toast: $('toast'),
  navToggle: $('navToggle'),
  navMobile: $('navMobile'),
};

// ============================================================
// App State
// ============================================================
let state = {
  currentImage: null,      // File or Blob
  extractedText: '',
  translatedText: '',
  cameraStream: null,
  isProcessing: false,
};

// ============================================================
// Utilities
// ============================================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function showToast(message, type = 'success') {
  dom.toast.textContent = message;
  dom.toast.className = `toast show ${type}`;
  setTimeout(() => dom.toast.classList.remove('show'), 3000);
}

// ============================================================
// Navbar Mobile Toggle
// ============================================================
if (dom.navToggle) {
  dom.navToggle.addEventListener('click', () => {
    dom.navMobile.classList.toggle('open');
  });
}

// ============================================================
// Tab Switching
// ============================================================
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  dom.panelUpload.classList.toggle('active', tab === 'upload');
  dom.panelCamera.classList.toggle('active', tab === 'camera');
  
  if (tab !== 'camera') stopCamera();
  updateProcessButton();
}

dom.tabUpload?.addEventListener('click', () => switchTab('upload'));
dom.tabCamera?.addEventListener('click', () => switchTab('camera'));

// ============================================================
// File Upload
// ============================================================
dom.dropZone?.addEventListener('click', () => dom.fileInput.click());

dom.dropZone?.addEventListener('dragover', e => {
  e.preventDefault();
  dom.dropZone.classList.add('dragover');
});

dom.dropZone?.addEventListener('dragleave', () => {
  dom.dropZone.classList.remove('dragover');
});

dom.dropZone?.addEventListener('drop', e => {
  e.preventDefault();
  dom.dropZone.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

dom.fileInput?.addEventListener('change', e => {
  if (e.target.files?.[0]) handleFile(e.target.files[0]);
});

dom.clearImage?.addEventListener('click', (e) => {
  e.stopPropagation();
  clearImage();
});

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file', 'error');
    return;
  }
  
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > CONFIG.MAX_IMAGE_SIZE_MB) {
    showToast(`Image too large (max ${CONFIG.MAX_IMAGE_SIZE_MB} MB)`, 'error');
    return;
  }
  
  state.currentImage = file;
  
  // Preview
  const url = URL.createObjectURL(file);
  dom.previewImg.src = url;
  dom.imagePreview.style.display = 'block';
  dom.dropZoneBody.style.display = 'none';
  
  updateProcessButton();
  resetResults();
}

function clearImage() {
  state.currentImage = null;
  dom.previewImg.src = '';
  dom.imagePreview.style.display = 'none';
  dom.dropZoneBody.style.display = 'block';
  dom.fileInput.value = '';
  updateProcessButton();
  resetResults();
}

// ============================================================
// Camera Functions
// ============================================================
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    
    state.cameraStream = stream;
    dom.cameraVideo.srcObject = stream;
    dom.cameraVideo.style.display = 'block';
    dom.cameraPlaceholder.style.display = 'none';
    dom.startCameraBtn.style.display = 'none';
    dom.captureCameraBtn.disabled = false;
    dom.stopCameraBtn.style.display = 'inline-flex';
    
    showToast('Camera ready! Position your document and tap Capture.', 'success');
  } catch (err) {
    let msg = 'Camera access denied.';
    if (err.name === 'NotFoundError') msg = 'No camera found on this device.';
    if (err.name === 'NotAllowedError') msg = 'Camera permission denied. Please allow access.';
    showToast(msg, 'error');
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
    state.currentImage = blob;
    
    // Preview
    const url = URL.createObjectURL(blob);
    dom.previewImg.src = url;
    dom.imagePreview.style.display = 'block';
    dom.dropZoneBody.style.display = 'none';
    
    stopCamera();
    switchTab('upload');
    updateProcessButton();
    resetResults();
    
    showToast('Frame captured! Ready to extract text.', 'success');
  }, 'image/jpeg', 0.9);
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  dom.cameraVideo.srcObject = null;
  dom.cameraVideo.style.display = 'none';
  dom.cameraPlaceholder.style.display = 'block';
  dom.startCameraBtn.style.display = 'inline-flex';
  dom.captureCameraBtn.disabled = true;
  dom.stopCameraBtn.style.display = 'none';
}

dom.startCameraBtn?.addEventListener('click', startCamera);
dom.captureCameraBtn?.addEventListener('click', captureFrame);
dom.stopCameraBtn?.addEventListener('click', stopCamera);

// ============================================================
// Image Preprocessing
// ============================================================
async function preprocessImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(source);
    
    img.onload = () => {
      let { width, height } = img;
      const maxDim = CONFIG.RESIZE_MAX_DIMENSION;
      
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) reject(new Error('Image processing failed'));
        else resolve(blob);
      }, 'image/jpeg', CONFIG.JPEG_QUALITY);
    };
    
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = url;
  });
}

// ============================================================
// OCR Processing
// ============================================================
async function performOCR(imageBlob, lang) {
  if (CONFIG.DEMO_MODE) {
    await sleep(1500);
    return getDemoText();
  }
  
  const formData = new FormData();
  formData.append('image', imageBlob, 'document.jpg');
  formData.append('lang', lang);
  
  const response = await fetch(`${CONFIG.BACKEND_URL}/api/ocr`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Server error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.text || '';
}

function updateProcessButton() {
  const hasImage = state.currentImage !== null;
  dom.processBtn.disabled = !hasImage || state.isProcessing;
}

function showProgress() {
  dom.progressArea.style.display = 'block';
  [dom.step1, dom.step2, dom.step3, dom.step4].forEach(step => {
    if (step) step.classList.remove('active');
  });
  dom.progressFill.style.width = '0%';
}

function hideProgress() {
  setTimeout(() => {
    dom.progressArea.style.display = 'none';
  }, 500);
}

async function animateStep(stepEl, targetPercent) {
  if (stepEl) stepEl.classList.add('active');
  const startPercent = parseFloat(dom.progressFill.style.width) || 0;
  const duration = 500;
  const startTime = performance.now();
  
  return new Promise(resolve => {
    function animate(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const newPercent = startPercent + (targetPercent - startPercent) * eased;
      dom.progressFill.style.width = `${newPercent}%`;
      if (progress < 1) requestAnimationFrame(animate);
      else resolve();
    }
    requestAnimationFrame(animate);
  });
}

function showResults() {
  dom.resultsArea.style.display = 'block';
  setTimeout(() => dom.resultsArea.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

function resetResults() {
  dom.resultsArea.style.display = 'none';
  dom.resultsText.value = '';
  dom.translatedOutput.style.display = 'none';
  dom.translatedText.textContent = '';
  state.extractedText = '';
  state.translatedText = '';
}

async function runOCR() {
  if (!state.currentImage) return;
  
  state.isProcessing = true;
  updateProcessButton();
  resetResults();
  showProgress();
  
  try {
    // Step 1: Preprocess
    await animateStep(dom.step1, 20);
    const processedBlob = await preprocessImage(state.currentImage);
    
    // Step 2: OCR
    await animateStep(dom.step2, 60);
    const lang = dom.ocrLang?.value || 'eng';
    const text = await performOCR(processedBlob, lang);
    
    // Step 3: Extract
    await animateStep(dom.step3, 85);
    
    // Step 4: Complete
    await animateStep(dom.step4, 100);
    
    state.extractedText = text;
    dom.resultsText.value = text;
    
    hideProgress();
    showResults();
    showToast('Text extracted successfully!', 'success');
  } catch (err) {
    hideProgress();
    showToast(`Error: ${err.message}`, 'error');
    console.error(err);
  } finally {
    state.isProcessing = false;
    updateProcessButton();
  }
}

dom.processBtn?.addEventListener('click', runOCR);

// ============================================================
// Translation
// ============================================================
async function performTranslation(text, targetLang) {
  if (CONFIG.DEMO_MODE) {
    await sleep(1000);
    return `[DEMO] Translated to ${targetLang}:\n\n${text.substring(0, 200)}...\n\n(Connect to backend for real translation)`;
  }
  
  const response = await fetch(`${CONFIG.BACKEND_URL}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, target: targetLang }),
  });
  
  if (!response.ok) {
    throw new Error(`Translation failed: ${response.status}`);
  }
  
  const data = await response.json();
  return data.translated_text || text;
}

async function runTranslate() {
  const text = dom.resultsText.value.trim();
  if (!text) {
    showToast('No text to translate', 'error');
    return;
  }
  
  const targetLang = dom.translateTo?.value;
  if (!targetLang) {
    showToast('Select a target language', 'error');
    return;
  }
  
  const originalBtnText = dom.translateBtn.innerHTML;
  dom.translateBtn.disabled = true;
  dom.translateBtn.innerHTML = '⏳ Translating...';
  
  try {
    const translated = await performTranslation(text, targetLang);
    state.translatedText = translated;
    
    const langName = dom.translateTo.options[dom.translateTo.selectedIndex]?.text || targetLang;
    dom.translatedLangLabel.textContent = `→ ${langName}`;
    dom.translatedText.textContent = translated;
    dom.translatedOutput.style.display = 'block';
    
    showToast('Translation complete!', 'success');
  } catch (err) {
    showToast(`Translation failed: ${err.message}`, 'error');
  } finally {
    dom.translateBtn.disabled = false;
    dom.translateBtn.innerHTML = originalBtnText;
  }
}

dom.translateBtn?.addEventListener('click', runTranslate);

// ============================================================
// Copy Functions
// ============================================================
async function copyToClipboard(text, successMsg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg, 'success');
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast(successMsg, 'success');
  }
}

dom.copyBtn?.addEventListener('click', () => {
  if (dom.resultsText.value) {
    copyToClipboard(dom.resultsText.value, 'Text copied!');
  }
});

dom.copyTranslatedBtn?.addEventListener('click', () => {
  if (dom.translatedText.textContent) {
    copyToClipboard(dom.translatedText.textContent, 'Translation copied!');
  }
});

dom.clearResultsBtn?.addEventListener('click', () => {
  resetResults();
  showToast('Results cleared', 'success');
});

// ============================================================
// Download Functions
// ============================================================
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

function downloadTxt(text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, 'scandoc_output.txt');
  showToast('Text file downloaded!', 'success');
}

async function buildDocx(text) {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip not loaded');
  }
  
  const zip = new JSZip();
  const escapeXml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  const paragraphs = text.split('\n').map(line => {
    if (line.trim() === '') {
      return '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>';
    }
    return `<w:p>
      <w:pPr><w:spacing w:after="120"/></w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="24"/></w:rPr>
        <w:t xml:space="preserve">${escapeXml(line)}</w:t>
      </w:r>
    </w:p>`;
  }).join('\n');
  
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>ScanDoc Extracted Document</w:t></w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:rPr><w:color w:val="888888"/><w:sz w:val="18"/></w:rPr>
        <w:t>Generated on ${new Date().toLocaleDateString()}</w:t>
      </w:r>
    </w:p>
    <w:p><w:pPr><w:spacing w:after="200"/></w:pPr></w:p>
    ${paragraphs}
  </w:body>
</w:document>`;
  
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="4CAF50"/></w:rPr>
  </w:style>
</w:styles>`;
  
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
  
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  
  const wordRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rels);
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', wordRels);
  zip.file('word/styles.xml', stylesXml);
  
  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

async function downloadDocument() {
  const text = dom.resultsText.value.trim();
  if (!text) {
    showToast('No text to download', 'error');
    return;
  }
  
  const format = dom.outputFormat?.value || 'docx';
  
  if (format === 'txt') {
    downloadTxt(text);
    return;
  }
  
  const originalText = dom.downloadBtn.innerHTML;
  dom.downloadBtn.disabled = true;
  dom.downloadBtn.innerHTML = '⏳ Generating DOCX...';
  
  try {
    if (!CONFIG.DEMO_MODE) {
      const response = await fetch(`${CONFIG.BACKEND_URL}/api/generate-docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, title: 'ScanDoc Document' }),
      });
      
      if (response.ok) {
        const blob = await response.blob();
        downloadBlob(blob, 'scandoc_output.docx');
        showToast('Document downloaded!', 'success');
        dom.downloadBtn.disabled = false;
        dom.downloadBtn.innerHTML = originalText;
        return;
      }
    }
    
    // Fallback to client-side generation
    const blob = await buildDocx(text);
    downloadBlob(blob, 'scandoc_output.docx');
    showToast('Document downloaded!', 'success');
  } catch (err) {
    showToast(`Download failed: ${err.message}`, 'error');
    downloadTxt(text);
  } finally {
    dom.downloadBtn.disabled = false;
    dom.downloadBtn.innerHTML = originalText;
  }
}

dom.downloadBtn?.addEventListener('click', downloadDocument);

// ============================================================
// Demo Text (Fallback)
// ============================================================
function getDemoText() {
  return `[DEMO MODE] This is simulated OCR output.

To use real OCR, set DEMO_MODE: false in script.js and ensure your backend is running at ${CONFIG.BACKEND_URL}

Example extracted content:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Invoice #INV-2025-001
Date: April 13, 2025
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Item              Qty    Price    Total
Consulting         2     $150     $300
Development        5     $200    $1000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: $1,300.00

Thank you for your business!`;
}

// ============================================================
// Check Camera Support
// ============================================================
if (!navigator.mediaDevices?.getUserMedia && dom.tabCamera) {
  dom.tabCamera.disabled = true;
  dom.tabCamera.style.opacity = '0.5';
  dom.tabCamera.style.cursor = 'not-allowed';
}

// ============================================================
// Update Process Button on Load
// ============================================================
updateProcessButton();

// ============================================================
// Show Backend Status on Load
// ============================================================
async function checkBackendHealth() {
  if (CONFIG.DEMO_MODE) {
    console.log('Demo mode enabled, skipping backend check');
    return;
  }
  
  try {
    const response = await fetch(`${CONFIG.BACKEND_URL}/api/health`, { timeout: 5000 });
    if (response.ok) {
      console.log('✅ Backend connected');
      showToast('Backend connected!', 'success');
    } else {
      console.warn('⚠️ Backend responded but not healthy');
    }
  } catch (err) {
    console.warn('⚠️ Backend not reachable, check if server is running');
    showToast('Backend not reachable. Check your OCI instance.', 'error');
  }
}

checkBackendHealth();

console.log('ScanDoc initialized');
console.log(`Backend URL: ${CONFIG.BACKEND_URL}`);
console.log(`Demo mode: ${CONFIG.DEMO_MODE}`);
