/**
 * ScanDoc — Main Application Script
 * Features: OCR, Camera Capture, Translation, DOCX Download
 * Backend: OCI Flask API (configurable via BACKEND_URL)
 */

// ═══════════════════════════════════════════════════
//  CONFIGURATION — Update BACKEND_URL with your OCI IP
// ═══════════════════════════════════════════════════
const CONFIG = {
  BACKEND_URL: 'https://139.185.61.225:5001',   // Replace with actual backend
  MAX_IMAGE_SIZE_MB: 10,
  RESIZE_MAX_DIMENSION: 2048,      // px before sending to OCR
  JPEG_QUALITY: 0.88,
  DEMO_MODE: true,                 // Set false when backend is live
};

// ═══════════════════════════════════════════════════
//  DOM REFERENCES
// ═══════════════════════════════════════════════════
const $ = id => document.getElementById(id);

const dom = {
  // Tabs
  tabUpload:   $('tabUpload'),
  tabCamera:   $('tabCamera'),
  panelUpload: $('panelUpload'),
  panelCamera: $('panelCamera'),

  // Upload
  dropZone:      $('dropZone'),
  dropZoneBody:  $('dropZoneBody'),
  fileInput:     $('fileInput'),
  imagePreview:  $('imagePreview'),
  previewImg:    $('previewImg'),
  clearImage:    $('clearImage'),

  // Camera
  cameraPlaceholder: $('cameraPlaceholder'),
  cameraVideo:       $('cameraVideo'),
  cameraCanvas:      $('cameraCanvas'),
  cameraOverlay:     $('cameraOverlay'),
  startCameraBtn:    $('startCameraBtn'),
  captureCameraBtn:  $('captureCameraBtn'),
  stopCameraBtn:     $('stopCameraBtn'),

  // Options
  ocrLang:      $('ocrLang'),
  outputFormat: $('outputFormat'),

  // Process
  processBtn:   $('processBtn'),

  // Progress
  progressArea: $('progressArea'),
  ps1: $('ps1'), ps2: $('ps2'), ps3: $('ps3'), ps4: $('ps4'),
  scanProgressFill: $('scanProgressFill'),

  // Results
  resultsArea:   $('resultsArea'),
  resultsText:   $('resultsText'),
  copyBtn:       $('copyBtn'),
  clearResultsBtn: $('clearResultsBtn'),

  // Translate
  translateTo:        $('translateTo'),
  translateBtn:       $('translateBtn'),
  translatedOutput:   $('translatedOutput'),
  translatedText:     $('translatedText'),
  translatedLangLabel: $('translatedLangLabel'),
  copyTranslatedBtn:  $('copyTranslatedBtn'),

  // Download
  downloadBtn: $('downloadBtn'),

  // Toast & Nav
  toast:      $('toast'),
  navToggle:  $('navToggle'),
  navMobile:  $('navMobile'),
};

// ═══════════════════════════════════════════════════
//  APP STATE
// ═══════════════════════════════════════════════════
const state = {
  currentTab: 'upload',
  imageFile: null,          // File object from upload
  capturedBlob: null,       // Blob from camera capture
  extractedText: '',
  translatedText: '',
  cameraStream: null,
  isProcessing: false,
};

// ═══════════════════════════════════════════════════
//  NAVBAR TOGGLE (mobile)
// ═══════════════════════════════════════════════════
dom.navToggle.addEventListener('click', () => {
  dom.navMobile.classList.toggle('open');
});

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

  // Stop camera when switching away
  if (tab !== 'camera') stopCamera();

  updateProcessButton();
}

dom.tabUpload.addEventListener('click', () => switchTab('upload'));
dom.tabCamera.addEventListener('click', () => switchTab('camera'));

// ═══════════════════════════════════════════════════
//  FILE UPLOAD / DROP ZONE
// ═══════════════════════════════════════════════════
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

dom.fileInput.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (file) handleFileSelected(file);
});

dom.clearImage.addEventListener('click', e => {
  e.stopPropagation();
  clearUploadedImage();
});

function handleFileSelected(file) {
  // Validate type
  if (!file.type.startsWith('image/')) {
    showToast('Please upload an image file (JPEG, PNG, WEBP, BMP)', 'error');
    return;
  }

  // Validate size
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > CONFIG.MAX_IMAGE_SIZE_MB) {
    showToast(`Image too large (${sizeMB.toFixed(1)} MB). Max ${CONFIG.MAX_IMAGE_SIZE_MB} MB.`, 'error');
    return;
  }

  state.imageFile = file;
  state.capturedBlob = null;

  // Show preview
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
  dom.fileInput.value = '';
  updateProcessButton();
  resetResults();
}

// ═══════════════════════════════════════════════════
//  CAMERA
// ═══════════════════════════════════════════════════
dom.startCameraBtn.addEventListener('click', startCamera);
dom.captureCameraBtn.addEventListener('click', captureFrame);
dom.stopCameraBtn.addEventListener('click', stopCamera);

async function startCamera() {
  try {
    const constraints = {
      video: {
        facingMode: 'environment',  // Use rear camera on mobile
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

  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(blob => {
    state.capturedBlob = blob;
    state.imageFile = null;

    // Show snapshot preview
    const url = URL.createObjectURL(blob);
    dom.previewImg.src = url;
    dom.imagePreview.style.display = 'block';
    dom.dropZoneBody.style.display = 'none';

    stopCamera();
    switchTab('upload');  // Switch to upload tab to show preview
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
//  IMAGE PREPROCESSING (resize + compress)
// ═══════════════════════════════════════════════════
async function preprocessImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = source instanceof Blob
      ? URL.createObjectURL(source)
      : URL.createObjectURL(source);

    img.onload = () => {
      let { width, height } = img;
      const max = CONFIG.RESIZE_MAX_DIMENSION;

      if (width > max || height > max) {
        const ratio = Math.min(max / width, max / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');

      // Slight sharpening / contrast enhancement for OCR
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
dom.processBtn.addEventListener('click', runOCR);

function updateProcessButton() {
  const hasImage = state.imageFile || state.capturedBlob;
  dom.processBtn.disabled = !hasImage || state.isProcessing;
}

async function runOCR() {
  const source = state.imageFile || state.capturedBlob;
  if (!source) return;

  state.isProcessing = true;
  updateProcessButton();

  resetResults();
  showProgressArea();

  try {
    // Step 1 — Preprocess
    await animateStep(dom.ps1, 0, 20);
    const processedBlob = await preprocessImage(source);

    // Step 2 — Send to OCR backend (or Demo Mode)
    await animateStep(dom.ps2, 20, 60);
    const text = await performOCR(processedBlob);

    // Step 3 — Extract
    await animateStep(dom.ps3, 60, 85);

    // Step 4 — Prepare output
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
  if (CONFIG.DEMO_MODE) {
    // Demo: simulate backend response
    await sleep(1400);
    return getDemoText();
  }

  // Real backend call
  const formData = new FormData();
  formData.append('image', imageBlob, 'document.jpg');
  formData.append('lang', dom.ocrLang.value);

  const response = await fetch(`${CONFIG.BACKEND_URL}/api/ocr`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Server error ${response.status}`);
  }

  const data = await response.json();
  return data.text || '';
}

// ═══════════════════════════════════════════════════
//  TRANSLATION
// ═══════════════════════════════════════════════════
dom.translateBtn.addEventListener('click', runTranslate);

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
  if (CONFIG.DEMO_MODE) {
    await sleep(1200);
    return `[DEMO TRANSLATION to ${targetLang}]\n\n${text}\n\n(Connect a real backend with Google Translate API or LibreTranslate to get actual translations.)`;
  }

  const response = await fetch(`${CONFIG.BACKEND_URL}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, target: targetLang }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Server error ${response.status}`);
  }

  const data = await response.json();
  return data.translated_text || '';
}

dom.copyTranslatedBtn.addEventListener('click', () => {
  copyToClipboard(dom.translatedText.textContent, 'Translation copied!');
});

// ═══════════════════════════════════════════════════
//  DOCUMENT DOWNLOAD (.docx / .txt)
// ═══════════════════════════════════════════════════
dom.downloadBtn.addEventListener('click', downloadDocument);

async function downloadDocument() {
  const text = dom.resultsText.value.trim();
  if (!text) { showToast('Nothing to download.', 'error'); return; }

  const format = dom.outputFormat.value;

  if (format === 'txt') {
    downloadTxt(text);
    return;
  }

  // DOCX — try backend, fallback to client-side rich text
  if (CONFIG.DEMO_MODE) {
    generateDocxClientSide(text);
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

/**
 * Client-side DOCX generation using the XML/ZIP approach.
 * Creates a valid .docx using raw Office Open XML.
 */
async function generateDocxClientSide(text) {
  dom.downloadBtn.disabled = true;
  const original = dom.downloadBtn.innerHTML;
  dom.downloadBtn.innerHTML = `<span class="btn-spinner"></span> Generating…`;

  try {
    // Build minimal DOCX structure (Office Open XML)
    const docxBlob = await buildDocx(text);
    downloadBlob(docxBlob, 'scandoc_output.docx');
    showToast('Document downloaded!', 'success');
  } catch (err) {
    showToast('DOCX generation failed. Downloading as .txt', 'error');
    downloadTxt(text);
  } finally {
    dom.downloadBtn.disabled = false;
    dom.downloadBtn.innerHTML = original;
  }
}

/**
 * Build a minimal .docx file from plain text.
 * Uses the JSZip library loaded from CDN, or falls back to .txt.
 */
async function buildDocx(text) {
  // Dynamically load JSZip if not present
  if (typeof JSZip === 'undefined') {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  }

  const zip = new JSZip();

  // Escape XML special characters
  const escapeXml = s => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  // Build paragraphs from text lines
  const paragraphs = text.split('\n').map(line => {
    if (line.trim() === '') {
      return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>`;
    }
    return `
      <w:p>
        <w:pPr><w:spacing w:after="120"/></w:pPr>
        <w:r>
          <w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
          <w:t xml:space="preserve">${escapeXml(line)}</w:t>
        </w:r>
      </w:p>`.trim();
  }).join('\n');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading1"/>
        <w:spacing w:after="200"/>
      </w:pPr>
      <w:r>
        <w:t>ScanDoc — Extracted Document</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="80"/></w:pPr>
      <w:r>
        <w:rPr><w:color w:val="888888"/><w:sz w:val="18"/></w:rPr>
        <w:t>Generated by ScanDoc on ${new Date().toLocaleDateString()}</w:t>
      </w:r>
    </w:p>
    <w:p><w:pPr><w:spacing w:after="200"/></w:pPr></w:p>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:sz w:val="24"/>
    </w:rPr></w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:b/>
      <w:sz w:val="36"/>
      <w:color w:val="1A2E1C"/>
    </w:rPr>
  </w:style>
</w:styles>`;

  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>ScanDoc</Application>
</Properties>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', rootRels);
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', relsXml);
  zip.file('word/styles.xml', stylesXml);
  zip.file('docProps/app.xml', appXml);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
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
dom.copyBtn.addEventListener('click', () => {
  copyToClipboard(dom.resultsText.value, 'Text copied to clipboard!');
});

async function copyToClipboard(text, successMsg = 'Copied!') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg, 'success');
  } catch {
    // Fallback for older browsers
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
  dom.progressArea.style.display = 'block';
  [dom.ps1, dom.ps2, dom.ps3, dom.ps4].forEach(p => {
    p.classList.remove('active', 'done');
  });
  dom.scanProgressFill.style.width = '0%';
}

function hideProgressArea() {
  setTimeout(() => { dom.progressArea.style.display = 'none'; }, 600);
}

function animateStep(stepEl, fromPct, toPct) {
  return new Promise(resolve => {
    // Mark previous steps done
    const allSteps = [dom.ps1, dom.ps2, dom.ps3, dom.ps4];
    const idx = allSteps.indexOf(stepEl);
    allSteps.forEach((el, i) => {
      if (i < idx) { el.classList.remove('active'); el.classList.add('done'); }
    });

    stepEl.classList.add('active');

    // Animate progress bar
    const duration = 600;
    const start = performance.now();
    const startPct = parseFloat(dom.scanProgressFill.style.width) || fromPct;

    function frame(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      dom.scanProgressFill.style.width = `${startPct + (toPct - startPct) * eased}%`;
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
  dom.resultsArea.style.display = 'block';
  // Smooth scroll to results
  setTimeout(() => {
    dom.resultsArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

function resetResults() {
  dom.resultsArea.style.display = 'none';
  dom.resultsText.value = '';
  dom.translatedOutput.style.display = 'none';
  dom.translatedText.textContent = '';
  state.extractedText = '';
  state.translatedText = '';
}

dom.clearResultsBtn.addEventListener('click', () => {
  resetResults();
  showToast('Results cleared.', 'success');
});

// ═══════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════
let toastTimeout;
function showToast(message, type = 'success') {
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
//  DEMO TEXT (used in DEMO_MODE)
// ═══════════════════════════════════════════════════
function getDemoText() {
  return `DEMO MODE — ScanDoc OCR Output
══════════════════════════════════

This is a simulated OCR extraction result.

In production, your actual image text will appear here after being processed by the Tesseract OCR engine running on your OCI backend.

Example extracted content:

Invoice #INV-2025-00147
Date: April 13, 2025
Client: Acme Corporation

Item Description       Qty   Unit Price   Total
─────────────────────────────────────────────────
Professional Services    1      $1,200     $1,200
Technical Consultation   3        $450     $1,350
Document Processing      5         $80       $400

                              TOTAL:    $2,950.00

Payment due within 30 days.
Bank: First National Bank
Account: 1234-5678-9012

Thank you for your business.

══════════════════════════════════
To enable real OCR, set DEMO_MODE = false
in script.js and configure BACKEND_URL.`;
}

// ═══════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════
(function init() {
  // Check camera support
  if (!navigator.mediaDevices?.getUserMedia) {
    dom.tabCamera.disabled = true;
    dom.tabCamera.title = 'Camera not supported in this browser';
    dom.tabCamera.style.opacity = '0.4';
    dom.tabCamera.style.cursor = 'not-allowed';
  }

  updateProcessButton();

  // Show demo mode banner if active
  if (CONFIG.DEMO_MODE) {
    const banner = document.createElement('div');
    banner.style.cssText = `
      background: linear-gradient(90deg, #FFEB3B22, #4CAF5022);
      border-bottom: 1px solid #4CAF5033;
      text-align: center;
      padding: 8px 20px;
      font-size: .78rem;
      font-weight: 600;
      color: #2e5e32;
      letter-spacing: .04em;
    `;
    banner.textContent = '⚡ DEMO MODE — Simulated OCR results. Connect your OCI backend to process real images.';
    document.body.insertBefore(banner, document.body.firstChild);
  }

  console.log('%cScanDoc initialized', 'color:#4CAF50;font-weight:bold;font-size:14px');
  console.log(`Demo mode: ${CONFIG.DEMO_MODE}`);
  console.log(`Backend: ${CONFIG.BACKEND_URL}`);
})();
