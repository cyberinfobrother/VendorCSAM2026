import { VendorStation, Participant } from '../types';

export const TOTAL_STATIONS_FOR_RAFFLE = 5;
export const TOTAL_EVENT_STATIONS = 6;

export const DEFAULT_VENDORS: VendorStation[] = [
  {
    id: 'V01',
    name: 'VENDOR 01 — Palo Alto Networks',
    category: 'Next-Gen Firewall & SASE',
    stampTitle: 'Zero-Day Shield Challenge',
    token: 'TOKEN-VENDOR-V01-PANW',
  },
  {
    id: 'V02',
    name: 'VENDOR 02 — CrowdStrike Falcon',
    category: 'Endpoint Detection & Response',
    stampTitle: 'Adversary Threat Hunt',
    token: 'TOKEN-VENDOR-V02-CRWD',
  },
  {
    id: 'V03',
    name: 'VENDOR 03 — Cloudflare Security',
    category: 'Edge & DDoS Mitigation',
    stampTitle: 'Edge Defense Simulator',
    token: 'TOKEN-VENDOR-V03-NET',
  },
  {
    id: 'V04',
    name: 'VENDOR 04 — Google Cloud Security',
    category: 'Cloud Architecture & IAM',
    stampTitle: 'Chronicle SIEM Blueprint',
    token: 'TOKEN-VENDOR-V04-GOOG',
  },
  {
    id: 'V05',
    name: 'VENDOR 05 — Cisco Security',
    category: 'Secure Access & Duo MFA',
    stampTitle: 'Phishing Defense Lab',
    token: 'TOKEN-VENDOR-V05-CSCO',
  },
  {
    id: 'V06',
    name: 'VENDOR 06 — Microsoft Defender',
    category: 'Identity & Purview Governance',
    stampTitle: 'Entra ID Zero-Trust Gate',
    token: 'TOKEN-VENDOR-V06-MSFT',
  },
];

export const INITIAL_PARTICIPANTS: Participant[] = [
  {
    token: 'PT-9421',
    name: 'Alex Rivera',
    office: 'SecOps & Threat Intel — Bldg 4B',
    completedVendors: ['V01', 'V02', 'V03', 'V05'],
  },
  {
    token: 'PT-3819',
    name: 'Elena Rostova',
    office: 'Cloud Architecture — Remote / EMEA',
    completedVendors: ['V01'],
  },
  {
    token: 'PT-7204',
    name: 'Marcus Chen',
    office: 'Enterprise IT & Infrastructure — Austin Hub',
    completedVendors: ['V01', 'V02', 'V03', 'V04', 'V05'],
  },
  {
    token: 'PT-5190',
    name: 'Amina Al-Mansoor',
    office: 'Compliance & Cyber Risk — London HQ',
    completedVendors: [],
  },
  {
    token: 'PT-8832',
    name: 'David K. Miller',
    office: 'Product Engineering — San Francisco',
    completedVendors: ['V02', 'V03'],
  },
  {
    token: 'PT-6311',
    name: 'Priya Patel',
    office: 'DevSecOps — Seattle Campus',
    completedVendors: ['V01', 'V04', 'V05'],
  },
];

const PARTICIPANTS_STORAGE_KEY = 'csam_vendor_participants_v1';
const SCANS_STORAGE_KEY = 'csam_vendor_scans_v1';
const CURRENT_VENDOR_KEY = 'csam_current_vendor_id_v1';

export function getStoredParticipants(): Participant[] {
  try {
    const data = localStorage.getItem(PARTICIPANTS_STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed reading participants from storage', e);
  }
  saveStoredParticipants(INITIAL_PARTICIPANTS);
  return INITIAL_PARTICIPANTS;
}

export function saveStoredParticipants(participants: Participant[]) {
  try {
    localStorage.setItem(PARTICIPANTS_STORAGE_KEY, JSON.stringify(participants));
  } catch (e) {
    console.error('Failed saving participants to storage', e);
  }
}

export function getStoredVendorId(): string {
  try {
    const saved = localStorage.getItem(CURRENT_VENDOR_KEY);
    if (saved && DEFAULT_VENDORS.some(v => v.id === saved)) {
      return saved;
    }
  } catch (e) {}
  return 'V04'; // Default to VENDOR 04 as featured in sample
}

export function saveStoredVendorId(id: string) {
  try {
    localStorage.setItem(CURRENT_VENDOR_KEY, id);
  } catch (e) {}
}
