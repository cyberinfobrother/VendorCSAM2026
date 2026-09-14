import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Default Vendors
const VENDORS: Record<string, { id: string; name: string; category: string; stampTitle: string; token: string }> = {
  'V01': { id: 'V01', name: 'VENDOR 01 — Palo Alto Networks', category: 'Next-Gen Firewall & SASE', stampTitle: 'Zero-Day Shield Challenge', token: 'TOKEN-VENDOR-V01-PANW' },
  'V02': { id: 'V02', name: 'VENDOR 02 — CrowdStrike Falcon', category: 'Endpoint Detection & Response', stampTitle: 'Adversary Threat Hunt', token: 'TOKEN-VENDOR-V02-CRWD' },
  'V03': { id: 'V03', name: 'VENDOR 03 — Cloudflare Security', category: 'Edge & DDoS Mitigation', stampTitle: 'Edge Defense Simulator', token: 'TOKEN-VENDOR-V03-NET' },
  'V04': { id: 'V04', name: 'VENDOR 04 — Google Cloud Security', category: 'Cloud Architecture & IAM', stampTitle: 'Chronicle SIEM Blueprint', token: 'TOKEN-VENDOR-V04-GOOG' },
  'V05': { id: 'V05', name: 'VENDOR 05 — Cisco Security', category: 'Secure Access & Duo MFA', stampTitle: 'Phishing Defense Lab', token: 'TOKEN-VENDOR-V05-CSCO' },
  'V06': { id: 'V06', name: 'VENDOR 06 — Microsoft Defender', category: 'Identity & Purview Governance', stampTitle: 'Entra ID Zero-Trust Gate', token: 'TOKEN-VENDOR-V06-MSFT' },
};

// In-memory persistent data store
interface ParticipantRecord {
  token: string;
  name: string;
  office: string;
  completedVendors: string[];
}

interface ScanLog {
  id: string;
  timestamp: number;
  dateTime: string;
  participantToken: string;
  participantName: string;
  participantOffice: string;
  vendorId: string;
  vendorName: string;
  isDuplicate: boolean;
  completionCount: number;
  totalRequired: number;
  raffleQualified: boolean;
  syncedToExternal?: boolean;
}

const participants: Map<string, ParticipantRecord> = new Map([
  ['PT-9421', { token: 'PT-9421', name: 'Alex Rivera', office: 'SecOps & Threat Intel — Bldg 4B', completedVendors: ['V01', 'V02', 'V03', 'V05'] }],
  ['PT-3819', { token: 'PT-3819', name: 'Elena Rostova', office: 'Cloud Architecture — Remote / EMEA', completedVendors: ['V01'] }],
  ['PT-7204', { token: 'PT-7204', name: 'Marcus Chen', office: 'Enterprise IT & Infrastructure — Austin Hub', completedVendors: ['V01', 'V02', 'V03', 'V04', 'V05'] }],
  ['PT-5190', { token: 'PT-5190', name: 'Amina Al-Mansoor', office: 'Compliance & Cyber Risk — London HQ', completedVendors: [] }],
  ['PT-8832', { token: 'PT-8832', name: 'David K. Miller', office: 'Product Engineering — San Francisco', completedVendors: ['V02', 'V03'] }],
  ['PT-6311', { token: 'PT-6311', name: 'Priya Patel', office: 'DevSecOps — Seattle Campus', completedVendors: ['V01', 'V04', 'V05'] }],
]);

let scanHistory: ScanLog[] = [];
let externalBackendUrl: string = process.env.BACKEND_WEBHOOK_URL || '';

const TOTAL_REQUIRED_FOR_RAFFLE = 5;
const TOTAL_STATIONS = 6;

// Helper to resolve vendor from token or ID
function findVendor(tokenOrId: string) {
  if (!tokenOrId) return VENDORS['V04'];
  const clean = tokenOrId.trim();
  // Check direct key
  if (VENDORS[clean.toUpperCase()]) {
    return VENDORS[clean.toUpperCase()];
  }
  // Check by token or id match
  for (const v of Object.values(VENDORS)) {
    if (v.id.toLowerCase() === clean.toLowerCase() || v.token.toLowerCase() === clean.toLowerCase()) {
      return v;
    }
  }
  // If starts with V and 2 digits
  const vMatch = clean.match(/V0?\d+/i);
  if (vMatch) {
    const key = vMatch[0].toUpperCase();
    if (VENDORS[key]) return VENDORS[key];
  }
  return VENDORS['V04']; // default fallback
}

// ----------------- API ROUTES ----------------- //

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    vendorsCount: Object.keys(VENDORS).length,
    participantsCount: participants.size,
    scansCount: scanHistory.length,
    externalBackendConfigured: !!externalBackendUrl,
  });
});

// 1. Validate Vendor Station (matches google.script.run validateVendorStation)
app.get('/api/vendor/validate', (req, res) => {
  const vendorToken = (req.query.vendorToken || req.query.token || req.query.vendor || 'V04') as string;
  const vendor = findVendor(vendorToken);
  res.json({
    success: true,
    vendor: vendor.id,
    vendorName: vendor.name,
    category: vendor.category,
    stampTitle: vendor.stampTitle,
    token: vendor.token,
  });
});

// 2. Record Vendor Scan (matches google.script.run recordVendorScan)
app.post('/api/vendor/scan', async (req, res) => {
  try {
    const { vendorToken, participantToken } = req.body;

    if (!participantToken || !participantToken.trim()) {
      res.status(400).json({ success: false, message: 'Participant token is required.' });
      return;
    }

    let token = participantToken.trim();
    // Parse URL if formatted as https://domain.com/passport?p=PT-XXXX
    try {
      if (token.startsWith('http://') || token.startsWith('https://')) {
        const u = new URL(token);
        token = u.searchParams.get('p') || u.searchParams.get('participant') || token;
      } else if (token.startsWith('{') && token.endsWith('}')) {
        const parsed = JSON.parse(token);
        token = parsed.p || parsed.participantToken || parsed.token || token;
      }
    } catch (e) {}

    const vendor = findVendor(vendorToken || 'V04');

    // Forward to external backend link if configured
    let externalResponse: any = null;
    let externalError: string | null = null;
    if (externalBackendUrl) {
      try {
        const response = await fetch(externalBackendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            action: 'recordVendorScan',
            vendorToken: vendor.token,
            vendorId: vendor.id,
            participantToken: token,
            timestamp: new Date().toISOString(),
          }),
        });
        if (response.ok) {
          const text = await response.text();
          try {
            externalResponse = JSON.parse(text);
          } catch (e) {
            externalResponse = { raw: text };
          }
        }
      } catch (err: any) {
        externalError = err.message || 'External forwarding failed';
        console.warn('External backend forwarding error:', externalError);
      }
    }

    // Lookup or dynamically create participant record
    let participant = participants.get(token);
    if (!participant) {
      participant = {
        token,
        name: `Guest Participant (${token.slice(0, 8)})`,
        office: 'Attendee — Security Summit 2026',
        completedVendors: [],
      };
      participants.set(token, participant);
    }

    const alreadyCompleted = participant.completedVendors.includes(vendor.id);
    let completion = participant.completedVendors.length;

    if (!alreadyCompleted) {
      participant.completedVendors.push(vendor.id);
      completion = participant.completedVendors.length;
    }

    const isRaffleQualified = completion >= TOTAL_REQUIRED_FOR_RAFFLE;

    // Log the scan
    const log: ScanLog = {
      id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      dateTime: new Date().toLocaleString(),
      participantToken: participant.token,
      participantName: participant.name,
      participantOffice: participant.office,
      vendorId: vendor.id,
      vendorName: vendor.name,
      isDuplicate: alreadyCompleted,
      completionCount: completion,
      totalRequired: TOTAL_STATIONS,
      raffleQualified: isRaffleQualified,
      syncedToExternal: !!externalResponse,
    };
    scanHistory.unshift(log);

    // Format response matching Google Apps Script structure
    res.json({
      success: true,
      duplicate: alreadyCompleted,
      vendor: vendor.id,
      vendorName: vendor.name,
      name: participant.name,
      office: participant.office,
      completion,
      total: TOTAL_STATIONS,
      raffleQualified: isRaffleQualified,
      message: alreadyCompleted
        ? `Vendor ${vendor.id.substring(1)} was already completed.`
        : `Vendor ${vendor.id.substring(1)} has been recorded.`,
      externalBackend: externalBackendUrl
        ? { synced: !!externalResponse, url: externalBackendUrl, error: externalError }
        : null,
    });
  } catch (error: any) {
    console.error('Scan processing error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Server error processing scan.' });
  }
});

// 3. Get Scan History
app.get('/api/vendor/scans', (req, res) => {
  const vendorId = req.query.vendorId as string;
  if (vendorId) {
    const filtered = scanHistory.filter((s) => s.vendorId === vendorId);
    res.json({ scans: filtered, total: filtered.length });
  } else {
    res.json({ scans: scanHistory, total: scanHistory.length });
  }
});

// 4. Clear Scan History
app.delete('/api/vendor/scans', (req, res) => {
  scanHistory = [];
  res.json({ success: true, message: 'Scan history reset.' });
});

// 5. Participants Directory
app.get('/api/vendor/participants', (req, res) => {
  res.json({ participants: Array.from(participants.values()) });
});

// 6. External Backend Link Configuration
app.get('/api/backend/config', (req, res) => {
  res.json({
    backendUrl: externalBackendUrl,
    hasExternalBackend: !!externalBackendUrl,
    builtInBackendActive: true,
  });
});

app.post('/api/backend/config', (req, res) => {
  const { backendUrl } = req.body;
  if (typeof backendUrl === 'string') {
    externalBackendUrl = backendUrl.trim();
  }
  res.json({
    success: true,
    backendUrl: externalBackendUrl,
    hasExternalBackend: !!externalBackendUrl,
  });
});

// 7. Test External Backend Link
app.post('/api/backend/test', async (req, res) => {
  const targetUrl = (req.body.backendUrl || externalBackendUrl || '').trim();
  if (!targetUrl) {
    res.status(400).json({ success: false, message: 'Please provide a valid backend link URL.' });
    return;
  }

  try {
    const startTime = Date.now();
    const testPayload = {
      action: 'validateVendorStation',
      vendorToken: 'TOKEN-VENDOR-V04-GOOG',
      ping: 'test-handshake',
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(testPayload),
    });

    const elapsed = Date.now() - startTime;
    const responseText = await response.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      parsed = responseText.slice(0, 300);
    }

    res.json({
      success: response.ok,
      status: response.status,
      latencyMs: elapsed,
      response: parsed,
      message: response.ok
        ? `Successfully connected to backend in ${elapsed}ms!`
        : `Backend returned status ${response.status}`,
    });
  } catch (err: any) {
    res.status(502).json({
      success: false,
      message: `Failed connecting to backend: ${err.message || 'Network unreachable'}`,
    });
  }
});

// ----------------- VITE MIDDLEWARE SETUP ----------------- //

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Vendor Portal Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
