import Papa from 'papaparse';

export interface InventoryData {
  Date: string;
  Inspector: string;
  Transcriber?: string;
  Trans?: string;
  Duration: string;
  "Split Duration"?: string;
  "Online App"?: string;
  Category?: string;
  Status?: string;
  [key: string]: any;
}

export const DEFAULT_SPREADSHEET_ID = '13IcaWF8u7NdgiLDHsIjnSKnw9s0eO3aid9mNFDJ0Pcg';

export function getSpreadsheetId(): string {
  return localStorage.getItem('prp_spreadsheet_id') || DEFAULT_SPREADSHEET_ID;
}

export function setSpreadsheetId(id: string) {
  if (id.includes('docs.google.com/spreadsheets/d/')) {
    const match = id.match(/\/d\/(.*?)(\/|$)/);
    if (match && match[1]) {
      localStorage.setItem('prp_spreadsheet_id', match[1]);
      return;
    }
  }
  localStorage.setItem('prp_spreadsheet_id', id);
}

export async function fetchSheetData(sheetName: string): Promise<any[]> {
  try {
    const spreadsheetId = getSpreadsheetId();
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch sheet: ${sheetName}`);
    }
    const csvText = await response.text();
    
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          resolve(results.data);
        },
        error: (error: Error) => {
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error(`Error fetching sheet ${sheetName}:`, error);
    throw error;
  }
}

export async function fetchSpreadsheetData(): Promise<InventoryData[]> {
  // Default to Transformed for backward compatibility
  return fetchSheetData('Transformed');
}

export function parseDurationToSeconds(duration: string): number {
  if (!duration) return 0;
  const trimmed = String(duration).trim();
  
  // Handle HH:MM:SS or MM:SS
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map(Number);
    if (parts.length === 3) {
      return (isNaN(parts[0]) ? 0 : parts[0] * 3600) + 
             (isNaN(parts[1]) ? 0 : parts[1] * 60) + 
             (isNaN(parts[2]) ? 0 : parts[2]);
    } else if (parts.length === 2) {
      return (isNaN(parts[0]) ? 0 : parts[0] * 60) + 
             (isNaN(parts[1]) ? 0 : parts[1]);
    }
  }
  
  // Handle decimal hours (e.g., "1.5") or pure seconds
  const num = Number(trimmed);
  if (!isNaN(num)) {
    return num;
  }
  
  return 0;
}

export function formatSecondsToDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
