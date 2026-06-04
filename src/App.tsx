/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from "react";
import { 
  fetchSheetData,
  InventoryData, 
  parseDurationToSeconds, 
  formatSecondsToDuration,
  getSpreadsheetId,
  setSpreadsheetId
} from "./services/dataService";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from "recharts";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import { 
  RefreshCw, 
  Calendar as CalendarIcon, 
  Filter, 
  Download, 
  Smartphone,
  ChevronRight,
  Clock,
  UserCheck,
  Settings,
  Database,
  AlertCircle
} from "lucide-react";
import { format, parse, isValid, isSameDay } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COLORS = ['#141414', '#404040', '#737373', '#A3A3A3', '#D4D4D4'];

export default function App() {
  const [data, setData] = useState<any[]>([]);
  const [referenceData, setReferenceData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Helper to get value from item by index (item is now a raw array)
  const getVal = (item: any[], index: number) => {
    if (!item || index < 0 || index >= item.length) return "";
    const val = item[index];
    return val !== undefined && val !== null ? String(val).trim() : "";
  };

  // Helper to parse date robustly
  const parseDate = (dateStr: string) => {
    if (!dateStr) return null;
    const trimmed = dateStr.trim();
    if (!trimmed) return null;
    
    // Handle Excel serial dates (e.g., "45396")
    if (/^\d{5}$/.test(trimmed)) {
      const excelDate = Number(trimmed);
      return new Date((excelDate - 25569) * 86400 * 1000);
    }

    const formats = ['dd/MM/yyyy', 'd/M/yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy', 'M/d/yyyy'];
    for (const fmt of formats) {
      const d = parse(trimmed, fmt, new Date());
      if (isValid(d)) return d;
    }
    const d = new Date(trimmed);
    return isValid(d) ? d : null;
  };

  // Filters
  const [selectedSheet, setSelectedSheet] = useState<string>("Transformed");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date()); // Default to today
  const [selectedTrans, setSelectedTrans] = useState<string[]>([]);
  const [selectedInspector, setSelectedInspector] = useState<string>("all");
  const [selectedOnlineApp, setSelectedOnlineApp] = useState<string>("all");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempSpreadsheetId, setTempSpreadsheetId] = useState(getSpreadsheetId());
  const [manualDurationFlipped, setManualDurationFlipped] = useState(false);
  const [manualFilesFlipped, setManualFilesFlipped] = useState(false);
  const [manualTransFlipped, setManualTransFlipped] = useState(false);
  const [manualInspectorFlipped, setManualInspectorFlipped] = useState(false);
  const [isWorkloadFlipped, setIsWorkloadFlipped] = useState(false);

  // Derived flip state
  const isDurationFlipped = !selectedDate || manualDurationFlipped;
  const isFilesFlipped = !selectedDate || manualFilesFlipped;
  const isTransFlipped = !selectedDate || manualTransFlipped;
  const isInspectorFlipped = !selectedDate || manualInspectorFlipped;

  const loadData = async () => {
    setLoading(true);
    try {
      const [mainResult, refResult] = await Promise.all([
        fetchSheetData(selectedSheet),
        fetchSheetData('Reference')
      ]);
      setData(mainResult);
      setReferenceData(refResult);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError("Failed to load data. Please check the spreadsheet access.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedSheet]);

  useEffect(() => {
    // Auto-refresh every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedSheet]);

  const processedData = useMemo(() => {
    if (data.length === 0) return [];
    
    const results: any[] = [];
    const keys = Object.keys(data[0]);
    
    // Robust header discovery
    const findKey = (names: string[], preferredIdx?: number) => {
      const normalizedNames = names.map(n => n.toLowerCase().trim());
      
      // 1. Try exact match first
      let found = keys.find(k => normalizedNames.includes(k.toLowerCase().trim()));
      if (found) return found;
      
      // 2. Try partial match (starts with)
      found = keys.find(k => normalizedNames.some(n => k.toLowerCase().trim().startsWith(n)));
      if (found) return found;

      // 3. Try partial match (contains)
      found = keys.find(k => normalizedNames.some(n => k.toLowerCase().trim().includes(n)));
      if (found) return found;
      
      // 4. Fallback to preferred index if valid
      if (preferredIdx !== undefined && keys[preferredIdx]) return keys[preferredIdx];
      
      return undefined;
    };

    const dateKey = findKey(['date'], 0);
    const addressKey = findKey(['property address', 'address', 'property', 'location'], 1);
    const durationKey = findKey(['duration'], 2);
    const transKey = findKey(['transcriber', 'trans'], 3);
    const splitDurKey = keys[4]; // Column E as requested
    const compDateKey = findKey(['completed date', 'completed'], 6);
    const inspectorKey = findKey(['inspector'], 7);
    const appKey = findKey(['online app', 'app type', 'software'], 8);
    // Explicit Column I check (0-indexed col 8)
    const colIKey = keys[8];

    const getValByKey = (item: any, key: string | undefined) => {
      if (!item || !key) return "";
      const val = item[key];
      return val !== undefined && val !== null ? String(val).trim() : "";
    };

    let currentFileApp = "";
    let currentInspector = "";
    let currentDate = "";
    let currentAddress = "";
    let currentDuration = "";

    data.forEach(item => {
      const date = getValByKey(item, dateKey);
      const address = getValByKey(item, addressKey);
      const duration = getValByKey(item, durationKey);
      const inspector = getValByKey(item, inspectorKey);
      
      // Strict access to Column A (0), B (1), E (4), and I (8)
      const rawColA = getValByKey(item, keys[0]);
      const rawColB = getValByKey(item, keys[1]);
      const rawColE = getValByKey(item, keys[4]);
      const rawColI = getValByKey(item, keys[8]);

      // Condition: No inheritance for Online App (requested by user)
      // "map columns B, E and I as is. if I = blank, name it was word in App section in dashboard."
      const onlineApp = rawColI !== "" ? rawColI : "Word";

      // Grouping/Filtering Metadata
      const hasDate = date !== "" && date.toLowerCase() !== "date";
      const hasAddress = address !== "" && !address.toLowerCase().includes('total');
      const hasMainDuration = duration !== "" && duration !== "0:00:00" && duration !== "0";

      if (hasDate) currentDate = date;
      if (hasAddress) {
          currentAddress = address;
      }
      if (hasMainDuration) currentDuration = duration;
      if (inspector !== "") currentInspector = inspector;

      // Skip rows that don't belong to any property yet (e.g. empty rows at top)
      if (!currentAddress && !currentDate) return;

      // Skip rows that are totally empty in raw data to prevent inheritance trailing at end of sheet
      // Check crucial columns: Date, Address, Split Duration, Transcriber, Online App
      const isRawRowEmpty = !rawColA && !rawColB && !rawColE && !rawColI && !getValByKey(item, transKey);
      if (isRawRowEmpty) return;

      results.push({
        ...item,
        _date: currentDate,
        _address: rawColB || currentAddress, // Priority to raw Col B as requested
        _duration: currentDuration,
        _trans: getValByKey(item, transKey),
        _splitDuration: rawColE, // Column E as requested
        _status: getValByKey(item, keys[5]), // Column F (index 5) for status
        _completedDate: getValByKey(item, compDateKey),
        _inspector: inspector || currentInspector,
        _onlineApp: onlineApp
      });
    });

    const fileToCompDate = new Map<string, string>();
    results.forEach(row => {
      const key = `${row._date}|${row._address}|${row._duration}`;
      if (row._completedDate && row._completedDate.trim() !== '') {
        fileToCompDate.set(key, row._completedDate);
      }
    });

    results.forEach(row => {
      const key = `${row._date}|${row._address}|${row._duration}`;
      if (fileToCompDate.has(key)) {
        row._completedDate = fileToCompDate.get(key);
      }
    });

    return results.filter(item => {
      const trans = (item._trans || '').toLowerCase().trim();
      const inspector = (item._inspector || '').toLowerCase().trim();
      const address = (item._address || '').toLowerCase().trim();
      
      // Filter out summary rows
      if (trans.includes('total') || inspector.includes('total') || address.includes('total')) return false;
      // Filter out empty rows
      if (!item._date && !item._address && !item._trans) return false;
      
      return true;
    });
  }, [data]);

  // Base filtered data (Date only) for stats and global counts
  const baseFilteredData = useMemo(() => {
    return processedData.filter(item => {
      if (!selectedDate) return true;
      
      const itemDate = parseDate(item._date);
      const compDate = parseDate(item._completedDate);
      
      const isInspectionToday = itemDate && isSameDay(itemDate, selectedDate);
      const isCompletionToday = compDate && isSameDay(compDate, selectedDate);
      
      return isInspectionToday || isCompletionToday;
    });
  }, [processedData, selectedDate]);

  const filteredData = useMemo(() => {
    return baseFilteredData.filter(item => {
      // Transcribers filter
      if (selectedTrans.length > 0) {
        const itemTrans = (item._trans || '').trim();
        const isMatch = selectedTrans.some(val => {
          if (val === '__unassigned__') return itemTrans === '';
          return itemTrans === val;
        });
        if (!isMatch) return false;

        // "Only filter view ... should look for files under process status"
        const status = (item._status || '').toLowerCase().trim();
        if (status !== 'process') return false;
      }

      // Inspector filter
      if (selectedInspector !== "all" && item._inspector !== selectedInspector) {
        return false;
      }

      // Online App filter
      if (selectedOnlineApp !== "all" && item._onlineApp !== selectedOnlineApp) {
        return false;
      }

      return true;
    });
  }, [baseFilteredData, selectedTrans, selectedInspector, selectedOnlineApp]);

  const filterOptions = useMemo(() => {
    const uniqueTrans = Array.from(new Set(processedData.map(item => item._trans).filter(Boolean))).sort();
    const hasUnassigned = processedData.some(item => !item._trans || item._trans.trim() === '');
    
    return {
      trans: uniqueTrans,
      hasUnassigned,
      inspectors: Array.from(new Set(processedData.map(item => item._inspector).filter(Boolean))).sort(),
      onlineApps: Array.from(new Set(processedData.map(item => item._onlineApp))).sort()
    };
  }, [processedData]);

  const stats = useMemo(() => {
    // 1. Calculate Daily & Monthly Totals (Ignoring Status/Transcriber filters, only Date)
    const dailyFilesMap = new Map<string, number>();
    const monthlyFilesMap = new Map<string, number>();
    const allCompletedFiles = new Set<string>();
    const dailyInspectorFiles = new Set<string>(); // fileKey + inspector
    const dailyInspectionsByInspectorMap: Record<string, number> = {};
    
    // All-time & Monthly stats for the "Back" side of cards
    const monthlyTransDurationMap: Record<string, number> = {};
    const allTimeTransDurationMap: Record<string, number> = {};
    const allTimeInspectorSet = new Set<string>();
    const allTimeInspectorCount: Record<string, number> = {};

    // Workload Matrix: Transcriber -> Inspector -> { daily, monthly }
    const workloadMatrix: Record<string, Record<string, { daily: number, monthly: number }>> = {};

    const now = new Date();
    const referenceDate = selectedDate || now;

    processedData.forEach(item => {
      const fileKey = `${item._date}|${item._address}|${item._duration}`;
      const itemDate = parseDate(item._date);
      const isCompleted = parseDate(item._completedDate) !== null;
      const transcriber = (item._trans || '').trim();
      const inspectorName = item._inspector.trim();

      if (isCompleted) {
        allCompletedFiles.add(fileKey);
      }

      // Transcriber All-Time Duration (Sum of Column E)
      if (transcriber && !transcriber.toLowerCase().includes('total')) {
        const seconds = parseDurationToSeconds(item._splitDuration);
        if (seconds > 0) {
          allTimeTransDurationMap[transcriber] = (allTimeTransDurationMap[transcriber] || 0) + seconds;
        }
      }

      if (inspectorName && !inspectorName.toLowerCase().includes('total')) {
        const key = `${fileKey}|${inspectorName}`;
        if (!allTimeInspectorSet.has(key)) {
          allTimeInspectorSet.add(key);
          allTimeInspectorCount[inspectorName] = (allTimeInspectorCount[inspectorName] || 0) + 1;
        }
      }

      if (itemDate) {
        const isSameDayAsRef = selectedDate && isSameDay(itemDate, selectedDate);
        const isSameMonthAsRef = itemDate.getMonth() === referenceDate.getMonth() && 
                                itemDate.getFullYear() === referenceDate.getFullYear() &&
                                itemDate <= referenceDate;

        // Daily logic (only if selectedDate is set)
        if (isSameDayAsRef) {
          if (!dailyFilesMap.has(fileKey)) {
            dailyFilesMap.set(fileKey, parseDurationToSeconds(item._duration));
          }
          
          if (inspectorName && !inspectorName.toLowerCase().includes('total')) {
            const uniqueInspectorKey = `${fileKey}|${inspectorName}`;
            if (!dailyInspectorFiles.has(uniqueInspectorKey)) {
              dailyInspectorFiles.add(uniqueInspectorKey);
              dailyInspectionsByInspectorMap[inspectorName] = (dailyInspectionsByInspectorMap[inspectorName] || 0) + 1;
            }
          }
        }
        
        // Monthly logic
        if (isSameMonthAsRef) {
          if (!monthlyFilesMap.has(fileKey)) {
            monthlyFilesMap.set(fileKey, parseDurationToSeconds(item._duration));
          }
          
          if (transcriber && !transcriber.toLowerCase().includes('total')) {
            const seconds = parseDurationToSeconds(item._splitDuration);
            monthlyTransDurationMap[transcriber] = (monthlyTransDurationMap[transcriber] || 0) + seconds;
          }
        }

        // Workload Matrix Logic (Unique files per transcriber-inspector pair)
        if (transcriber && !transcriber.toLowerCase().includes('total') && 
            inspectorName && !inspectorName.toLowerCase().includes('total')) {
          
          if (!workloadMatrix[transcriber]) workloadMatrix[transcriber] = {};
          if (!workloadMatrix[transcriber][inspectorName]) {
            workloadMatrix[transcriber][inspectorName] = { daily: 0, monthly: 0 };
          }

          // We only count unique files per pair
          const pairKey = `${fileKey}|${transcriber}|${inspectorName}`;
          
          // Using a temporary set for uniqueness within this loop is expensive, 
          // so we'll use a more efficient way if needed, but for now let's track it
          // Actually, we can just check if we already counted this file for this pair
          // But we need to distinguish daily vs monthly
        }
      }
    });

    // Re-calculating workload matrix with proper uniqueness
    const workloadDailySet = new Set<string>();
    const workloadMonthlySet = new Set<string>();

    processedData.forEach(item => {
      const fileKey = `${item._date}|${item._address}|${item._duration}`;
      const itemDate = parseDate(item._date);
      const transcriber = (item._trans || '').trim();
      const inspectorName = item._inspector.trim();

      if (!itemDate || !transcriber || !inspectorName || 
          transcriber.toLowerCase().includes('total') || 
          inspectorName.toLowerCase().includes('total')) return;

      const isSameDayAsRef = selectedDate && isSameDay(itemDate, selectedDate);
      const isSameMonthAsRef = itemDate.getMonth() === referenceDate.getMonth() && 
                              itemDate.getFullYear() === referenceDate.getFullYear() &&
                              itemDate <= referenceDate;

      if (!workloadMatrix[transcriber]) workloadMatrix[transcriber] = {};
      if (!workloadMatrix[transcriber][inspectorName]) {
        workloadMatrix[transcriber][inspectorName] = { daily: 0, monthly: 0 };
      }

      const pairKey = `${fileKey}|${transcriber}|${inspectorName}`;

      if (isSameDayAsRef && !workloadDailySet.has(pairKey)) {
        workloadDailySet.add(pairKey);
        workloadMatrix[transcriber][inspectorName].daily++;
      }
      if (isSameMonthAsRef && !workloadMonthlySet.has(pairKey)) {
        workloadMonthlySet.add(pairKey);
        workloadMatrix[transcriber][inspectorName].monthly++;
      }
    });

    let dailyTotalDurationSeconds = 0;
    dailyFilesMap.forEach(seconds => dailyTotalDurationSeconds += seconds);
    
    let monthlyTotalDurationSeconds = 0;
    monthlyFilesMap.forEach(seconds => monthlyTotalDurationSeconds += seconds);

    const dailyTotalInspections = dailyFilesMap.size;
    const totalCompletedTillDate = allCompletedFiles.size;

    // 2. Calculate Filtered Stats (Respecting all filters including Status)
    const fileDataMap = new Map<string, {
      duration: number,
      isAssigned: boolean,
      isCompleted: boolean,
      isPme: boolean,
      isAilo: boolean,
      transcribers: Set<string>
    }>();
    
    const durationByTransMap: Record<string, number> = {};
    const unassignedDurationMap: Record<string, number> = {}; 
    const processByTransSetMap: Record<string, Set<string>> = {};
    
    let unassignedCount = 0;
    let unassignedProcessCount = 0;
    let pmeCount = 0;
    let ailoCount = 0;
    let processCount = 0;

    // statsData is filtered by everything EXCEPT status
    const statsData = baseFilteredData.filter(item => {
      if (selectedTrans.length > 0) {
        const itemTrans = (item._trans || '').trim();
        const isMatch = selectedTrans.some(val => {
          if (val === '__unassigned__') return itemTrans === '';
          return itemTrans === val;
        });
        if (!isMatch) return false;
      }
      if (selectedInspector !== "all" && item._inspector !== selectedInspector) return false;
      if (selectedOnlineApp !== "all" && item._onlineApp !== selectedOnlineApp) return false;
      return true;
    });

    statsData.forEach(item => {
      const fileKey = `${item._date}|${item._address}|${item._duration}`;
      const transcriber = (item._trans || '').trim();
      const isAssigned = transcriber !== '' && transcriber.toLowerCase() !== 'total';
      const isCompleted = parseDate(item._completedDate) !== null;
      const onlineApp = (item._onlineApp || '').toLowerCase();
      const status = (item._status || '').toLowerCase();
      
      if (item._address && item._address.trim() !== '') {
        const existing = fileDataMap.get(fileKey);
        if (!existing) {
          fileDataMap.set(fileKey, {
            duration: parseDurationToSeconds(item._duration),
            isAssigned: isAssigned,
            isCompleted: isCompleted,
            isPme: onlineApp.includes('pme') || onlineApp.includes('propertyme'),
            isAilo: onlineApp.includes('ailo'),
            transcribers: isAssigned ? new Set([transcriber]) : new Set()
          });
        } else {
          if (isAssigned) {
            existing.isAssigned = true;
            existing.transcribers.add(transcriber);
          }
          if (isCompleted) existing.isCompleted = true;
          if (onlineApp.includes('pme') || onlineApp.includes('propertyme')) existing.isPme = true;
          if (onlineApp.includes('ailo')) existing.isAilo = true;
        }
      }

      // Transcriber duration Summary (Include ALL status)
      const name = isAssigned ? transcriber : "__unassigned__";
      if (name && !name.toLowerCase().includes('total')) {
        const seconds = parseDurationToSeconds(item._splitDuration || item._duration);
        if (seconds > 0) {
          durationByTransMap[name] = (durationByTransMap[name] || 0) + seconds;
        }
      }

      // Filter View logic: Only show files in "Process" status
      if (status === 'process') {
        if (!processByTransSetMap[name]) {
          processByTransSetMap[name] = new Set();
        }
        processByTransSetMap[name].add(fileKey);
      }
    });

    fileDataMap.forEach((data, fileKey) => {
      if (!data.isAssigned) {
        unassignedCount++;
        // We use the "Process" logic above for unassignedProcessCount if needed, 
        // but for general stats we'll stick to isCompleted if that's what was used before.
        // Actually let's use the explicit check for "Process" status within the loop if possible
        // but since fileDataMap groups multiple rows, we'll rely on the status check above 
        // which already populated processByTransSetMap["__unassigned__"].
      }
      
      if (data.isPme) pmeCount++;
      if (data.isAilo) ailoCount++;
      
      // Global process count (for stats badges)
      if (data.isAssigned && !data.isCompleted) {
        processCount++;
      }
    });

    // Sync unassigned process count from our set
    unassignedProcessCount = processByTransSetMap["__unassigned__"]?.size || 0;

    const durationByTrans = Object.entries(durationByTransMap)
      .filter(([name]) => name !== "__unassigned__")
      .map(([name, value]) => ({ 
        name, 
        internalName: name,
        value,
        formatted: formatSecondsToDuration(value),
        processCount: processByTransSetMap[name]?.size || 0
      }))
      .sort((a, b) => b.value - a.value);

    const inspectionsByInspector = Object.entries(dailyInspectionsByInspectorMap)
      .map(([name, value]) => ({ 
        name, 
        value 
      }))
      .sort((a, b) => b.value - a.value);

    const allTimeTransCompleted = Object.entries(allTimeTransDurationMap)
      .map(([name, value]) => ({ 
        name, 
        value,
        formatted: formatSecondsToDuration(value)
      }))
      .sort((a, b) => b.value - a.value);

    const monthlyTransCompleted = Object.entries(monthlyTransDurationMap)
      .map(([name, value]) => ({ 
        name, 
        value,
        formatted: formatSecondsToDuration(value)
      }))
      .sort((a, b) => b.value - a.value);

    const allTimeInspectorTotal = Object.entries(allTimeInspectorCount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Workload Matrix Table Data
    const allUniqueTranscribers: string[] = Array.from(new Set<string>(processedData.map(item => (item._trans || '').trim()).filter(t => t && !t.toLowerCase().includes('total')))).sort();
    const allUniqueInspectors: string[] = Array.from(new Set<string>(processedData.map(item => (item._inspector || '').trim()).filter(i => i && !i.toLowerCase().includes('total')))).sort();

    const workloadTable = allUniqueInspectors.map(inspector => {
      const row: Record<string, any> = { inspector };
      allUniqueTranscribers.forEach(trans => {
        row[trans] = workloadMatrix[trans]?.[inspector] || { daily: 0, monthly: 0 };
      });
      return row;
    });

    return {
      totalDuration: formatSecondsToDuration(dailyTotalDurationSeconds),
      monthlyTotalDuration: formatSecondsToDuration(monthlyTotalDurationSeconds),
      totalInspections: dailyTotalInspections,
      totalCompletedTillDate,
      durationByTrans,
      allTimeTransCompleted,
      monthlyTransCompleted,
      inspectionsByInspector,
      allTimeInspectorTotal,
      pmeCount,
      ailoCount,
      processCount,
      unassignedCount,
      workloadTable,
      allUniqueTranscribers,
      allUniqueInspectors
    };
  }, [processedData, baseFilteredData, filteredData, selectedDate, selectedTrans, selectedInspector, selectedOnlineApp]);

  if (loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#E4E3E0]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-[#141414]" />
          <p className="font-mono text-sm uppercase tracking-widest opacity-50">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans pb-12">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#E4E3E0]/80 backdrop-blur-md border-b border-[#141414]/10 px-4 py-4 md:px-8">
        <div className="max-w-7xl mx-auto flex flex-row items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight uppercase font-mono">Daily PRP Tracker</h1>
            <div className="flex items-center gap-2 mt-1 opacity-50 text-[10px] md:text-xs font-mono uppercase">
              <div className={cn("w-2 h-2 rounded-full", error ? "bg-red-500" : "bg-green-500")} />
              {lastUpdated ? `Last updated: ${format(lastUpdated, 'HH:mm:ss')}` : 'Connecting...'}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <DialogTrigger render={
                <Button variant="outline" size="sm" className="border-[#141414] h-8 md:h-9">
                  <Settings className="w-4 h-4 md:mr-2" />
                  <span className="hidden md:inline">Settings</span>
                </Button>
              } />
              <DialogContent className="bg-white border-[#141414] text-[#141414]">
                <DialogHeader>
                  <DialogTitle className="font-mono uppercase">Dashboard Settings</DialogTitle>
                  <DialogDescription className="font-mono text-xs">
                    Update the Google Spreadsheet source for this dashboard.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="spreadsheet-id" className="font-mono text-[10px] uppercase opacity-50">Spreadsheet ID or URL</Label>
                    <Input 
                      id="spreadsheet-id" 
                      value={tempSpreadsheetId} 
                      onChange={(e) => setTempSpreadsheetId(e.target.value)}
                      placeholder="Enter Spreadsheet ID or Link"
                      className="border-[#141414]/20 font-mono text-xs"
                    />
                    <p className="text-[10px] font-mono opacity-40 italic">
                      Example: 13IcaWF8u7NdgiLDHsIjnSKnw9s0eO3aid9mNFDJ0Pcg
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setTempSpreadsheetId(getSpreadsheetId());
                    }}
                    className="font-mono text-xs uppercase"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => {
                      setSpreadsheetId(tempSpreadsheetId);
                      setIsSettingsOpen(false);
                      loadData();
                    }}
                    className="bg-[#141414] text-white font-mono text-xs uppercase"
                  >
                    Save & Refresh
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 md:px-8 space-y-8">
        {/* Summary Widgets - AT TOP */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <AnimatePresence mode="wait">
            {/* Total Duration Flip Tile */}
            <div 
              key="duration-tile"
              className="relative h-[140px] cursor-pointer perspective-1000 group"
              onClick={() => setManualDurationFlipped(!manualDurationFlipped)}
            >
              <motion.div
                className="w-full h-full relative preserve-3d"
                animate={{ rotateY: isDurationFlipped ? 180 : 0 }}
                transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
              >
                {/* Front: Daily Duration */}
                <div className="absolute inset-0 backface-hidden bg-[#141414] text-[#E4E3E0] p-6 rounded-2xl shadow-xl flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <Clock className="w-5 h-5 opacity-50" />
                    <Badge variant="outline" className="text-[#E4E3E0] border-[#E4E3E0]/30 font-mono text-[10px]">DAILY TIME</Badge>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-widest opacity-50 mb-1">Total Duration</p>
                    <h3 className="text-3xl font-bold font-mono">{stats.totalDuration}</h3>
                  </div>
                </div>
                {/* Back: Monthly Duration */}
                <div 
                  className="absolute inset-0 backface-hidden bg-[#141414] text-[#E4E3E0] p-6 rounded-2xl shadow-xl flex flex-col justify-between"
                  style={{ transform: 'rotateY(180deg)' }}
                >
                  <div className="flex justify-between items-start">
                    <Clock className="w-5 h-5 opacity-50" />
                    <Badge variant="outline" className="text-[#E4E3E0] border-[#E4E3E0]/30 font-mono text-[10px]">MONTHLY TIME</Badge>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-widest opacity-50 mb-1">MTD Duration</p>
                    <h3 className="text-3xl font-bold font-mono">{stats.monthlyTotalDuration}</h3>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Total Files Flip Tile */}
            <div 
              key="files-tile"
              className="relative h-[140px] cursor-pointer perspective-1000 group"
              onClick={() => setManualFilesFlipped(!manualFilesFlipped)}
            >
              <motion.div
                className="w-full h-full relative preserve-3d"
                animate={{ rotateY: isFilesFlipped ? 180 : 0 }}
                transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
              >
                {/* Front: Process / Total */}
                <div className="absolute inset-0 backface-hidden bg-white text-[#141414] p-6 rounded-2xl shadow-sm border border-[#141414]/5 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <UserCheck className="w-5 h-5 opacity-50" />
                    <Badge variant="secondary" className="bg-[#141414]/5 text-[#141414] font-mono text-[10px]">DAILY FILES</Badge>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest opacity-50 mb-1">Process / Total</p>
                      <h3 className="text-3xl font-bold font-mono">
                        <span className="text-blue-600">{stats.processCount}</span>
                        <span className="opacity-30 mx-1">/</span>
                        <span>{stats.totalInspections}</span>
                      </h3>
                    </div>
                    {stats.unassignedCount > 0 && (
                      <div className="text-right">
                        <p className="text-[10px] font-mono uppercase opacity-50 leading-none mb-1">Unassigned</p>
                        <Badge variant="destructive" className="font-mono text-[10px] px-1.5 py-0 h-5">
                          {stats.unassignedCount}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
                {/* Back: Total Completed Till Date */}
                <div 
                  className="absolute inset-0 backface-hidden bg-white text-[#141414] p-6 rounded-2xl shadow-sm border border-[#141414]/5 flex flex-col justify-between"
                  style={{ transform: 'rotateY(180deg)' }}
                >
                  <div className="flex justify-between items-start">
                    <UserCheck className="w-5 h-5 opacity-50" />
                    <Badge variant="secondary" className="bg-green-100 text-green-800 font-mono text-[10px]">COMPLETED</Badge>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-widest opacity-50 mb-1">Total Completed</p>
                    <h3 className="text-3xl font-bold font-mono text-green-600">{stats.totalCompletedTillDate}</h3>
                    <p className="text-[10px] font-mono opacity-40 mt-1 italic">All-time unique files</p>
                  </div>
                </div>
              </motion.div>
            </div>

            <motion.div
              key="pme-count"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white text-[#141414] p-6 rounded-2xl shadow-sm border border-[#141414]/5 flex flex-col justify-between min-h-[140px]"
            >
              <div className="flex justify-between items-start">
                <Smartphone className="w-5 h-5 opacity-50" />
                <Badge variant="secondary" className="bg-blue-100 text-blue-800 font-mono text-[10px]">PROPERTYME</Badge>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest opacity-50 mb-1">PME Count</p>
                <h3 className="text-3xl font-bold font-mono">{stats.pmeCount}</h3>
              </div>
            </motion.div>

            <motion.div
              key="ailo-count"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white text-[#141414] p-6 rounded-2xl shadow-sm border border-[#141414]/5 flex flex-col justify-between min-h-[140px]"
            >
              <div className="flex justify-between items-start">
                <Smartphone className="w-5 h-5 opacity-50" />
                <Badge variant="secondary" className="bg-purple-100 text-purple-800 font-mono text-[10px]">AILO</Badge>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest opacity-50 mb-1">AILO Count</p>
                <h3 className="text-3xl font-bold font-mono">{stats.ailoCount}</h3>
              </div>
            </motion.div>
          </AnimatePresence>
        </section>

        {/* Filters */}
        <section className="bg-white/50 p-6 rounded-2xl border border-[#141414]/5 space-y-6">
          <div className="flex items-center gap-2 text-xs font-mono uppercase opacity-50">
            <Filter className="w-3 h-3" />
            Dashboard Filters
          </div>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="lg:w-1/4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase opacity-50">Date (Col A)</label>
                <Popover>
                  <PopoverTrigger
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "w-full justify-start text-left font-normal border-[#141414]/20 bg-white cursor-pointer",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "dd/MM/yyyy") : <span>Pick a date</span>}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white border-[#141414]">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      initialFocus
                    />
                    <div className="p-2 border-t border-[#141414]/10">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full text-xs uppercase font-mono"
                        onClick={() => setSelectedDate(undefined)}
                      >
                        Clear Date
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 lg:w-3/4">
              <div className="space-y-1.5 col-span-3">
                <label className="text-[10px] font-mono uppercase opacity-50">Transcriber Slicer (Col D)</label>
                <div className="flex flex-wrap gap-2 p-1">
                  <Button
                    variant={selectedTrans.length === 0 ? "default" : "outline"}
                    size="xs"
                    className="font-mono text-[10px] uppercase"
                    onClick={() => setSelectedTrans([])}
                  >
                    All
                  </Button>
                  {filterOptions.hasUnassigned && (
                    <Button
                      variant={selectedTrans.includes('__unassigned__') ? "default" : "outline"}
                      size="xs"
                      className={cn(
                        "font-mono text-[10px] uppercase transition-all duration-300",
                        selectedTrans.includes('__unassigned__') 
                          ? "bg-red-600 hover:bg-red-700 text-white border-red-600" 
                          : "border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                      )}
                      onClick={() => {
                        if (selectedTrans.includes('__unassigned__')) {
                          setSelectedTrans(selectedTrans.filter(t => t !== '__unassigned__'));
                        } else {
                          setSelectedTrans([...selectedTrans, '__unassigned__']);
                        }
                      }}
                    >
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Unassigned ({stats.unassignedCount})
                    </Button>
                  )}
                  {filterOptions.trans.map(opt => (
                    <Button
                      key={opt}
                      variant={selectedTrans.includes(opt) ? "default" : "outline"}
                      size="xs"
                      className="font-mono text-[10px] uppercase"
                      onClick={() => {
                        if (selectedTrans.includes(opt)) {
                          setSelectedTrans(selectedTrans.filter(t => t !== opt));
                        } else {
                          setSelectedTrans([...selectedTrans, opt]);
                        }
                      }}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase opacity-50">Inspector (Col B)</label>
                <Select value={selectedInspector} onValueChange={setSelectedInspector}>
                  <SelectTrigger className="border-[#141414]/20 bg-white">
                    <SelectValue placeholder="Select Inspector" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#141414]">
                    <SelectItem value="all">All Inspectors</SelectItem>
                    {filterOptions.inspectors.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase opacity-50">Online App (Col I)</label>
                <Select value={selectedOnlineApp} onValueChange={setSelectedOnlineApp}>
                  <SelectTrigger className="border-[#141414]/20 bg-white">
                    <SelectValue placeholder="Select App" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#141414]">
                    <SelectItem value="all">All Apps</SelectItem>
                    {filterOptions.onlineApps.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-[10px] uppercase font-mono opacity-50 hover:opacity-100"
              onClick={() => {
                setSelectedDate(undefined);
                setSelectedTrans([]);
                setSelectedInspector("all");
                setSelectedOnlineApp("all");
              }}
            >
              Reset All Filters
            </Button>
          </div>
        </section>

        {/* Summary Tables */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div 
            className="relative h-[450px] perspective-1000 cursor-pointer group"
            onClick={() => setManualTransFlipped(!manualTransFlipped)}
          >
            <motion.div
              className="w-full h-full relative preserve-3d"
              animate={{ rotateY: isTransFlipped ? 180 : 0 }}
              transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
            >
              {/* Front: Transcriber Durations / Process */}
              <Card className="absolute inset-0 backface-hidden border-[#141414]/5 shadow-sm overflow-hidden bg-white">
                <CardHeader className="border-b border-[#141414]/5 bg-[#141414]/5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <CardTitle className={cn(
                        "text-xs font-mono uppercase tracking-widest transition-all",
                        selectedTrans.includes('__unassigned__') && "text-red-600 text-sm font-bold"
                      )}>
                        {selectedTrans.length === 0 ? "Transcriber Durations" : `Filter View: ${selectedTrans.map(t => t === '__unassigned__' ? 'UNASSIGNED' : t).join(", ")}`}
                      </CardTitle>
                      {selectedTrans.length === 0 && stats.unassignedCount > 0 && (
                        <Badge variant="destructive" className="animate-pulse bg-red-600 text-white border-none text-[9px] h-5">
                          {stats.unassignedCount} UNASSIGNED
                        </Badge>
                      )}
                    </div>
                    <span className="text-[8px] font-mono opacity-50 uppercase tracking-tighter">Click to flip</span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    {selectedTrans.length === 0 ? (
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-white z-10">
                          <tr className="border-b border-[#141414]/10">
                            <th className="p-3 text-[10px] font-mono uppercase opacity-50">Transcriber</th>
                            <th className="p-3 text-[10px] font-mono uppercase opacity-50 text-right">Process</th>
                            <th className="p-3 text-[10px] font-mono uppercase opacity-50 text-right">Total Duration</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#141414]/5">
                          {stats.durationByTrans.map((item, i) => (
                            <tr 
                              key={i} 
                              className="hover:bg-[#141414]/5 transition-colors cursor-pointer"
                              onClick={() => setSelectedTrans([item.internalName])}
                            >
                              <td className="p-3 text-xs font-medium">
                                {item.name}
                              </td>
                              <td className="p-3 text-xs font-mono text-right">
                                {item.processCount > 0 ? (
                                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 font-mono text-[10px]">
                                    {item.processCount}
                                  </Badge>
                                ) : (
                                  <span className="opacity-20">-</span>
                                )}
                              </td>
                              <td className="p-3 text-xs font-mono text-right">{item.formatted}</td>
                            </tr>
                          ))}
                          {stats.durationByTrans.length === 0 && (
                            <tr>
                              <td colSpan={3} className="p-8 text-center text-xs opacity-50 italic font-mono">No data found for selection</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    ) : (
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-white z-10">
                          <tr className="border-b border-[#141414]/10">
                            <th className="p-3 text-[10px] font-mono uppercase opacity-50">Property Address</th>
                            {selectedTrans.includes('__unassigned__') && selectedTrans.length === 1 ? (
                              <>
                                <th className="p-3 text-[10px] font-mono uppercase opacity-50">Duration</th>
                                <th className="p-3 text-[10px] font-mono uppercase opacity-50">Inspector</th>
                                <th className="p-3 text-[10px] font-mono uppercase opacity-50">Online App</th>
                              </>
                            ) : (
                              <>
                                <th className="p-3 text-[10px] font-mono uppercase opacity-50">Split Duration</th>
                                <th className="p-3 text-[10px] font-mono uppercase opacity-50">Inspector</th>
                                <th className="p-3 text-[10px] font-mono uppercase opacity-50">Online App</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#141414]/5">
                          {filteredData
                            .map((item, i) => (
                              <tr key={i} className="hover:bg-[#141414]/5 transition-colors">
                                <td className="p-3 text-xs font-medium max-w-[200px] truncate" title={item._address}>
                                  {item._address}
                                </td>
                                {selectedTrans.includes('__unassigned__') && selectedTrans.length === 1 ? (
                                  <>
                                    <td className="p-3 text-xs font-mono">{item._duration}</td>
                                    <td className="p-3 text-xs">{item._inspector}</td>
                                    <td className="p-3 text-xs">
                                      {item._onlineApp && item._onlineApp !== "Word" ? (
                                        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-100 font-mono text-[10px]">
                                          {item._onlineApp}
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="font-mono text-[10px] opacity-50">
                                          Word
                                        </Badge>
                                      )}
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="p-3 text-xs font-mono">{item._splitDuration}</td>
                                    <td className="p-3 text-xs">{item._inspector}</td>
                                    <td className="p-3 text-xs">
                                      {item._onlineApp && item._onlineApp !== "Word" ? (
                                        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-100 font-mono text-[10px]">
                                          {item._onlineApp}
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="font-mono text-[10px] opacity-50">
                                          Word
                                        </Badge>
                                      )}
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                          {filteredData.length === 0 && (
                            <tr>
                              <td colSpan={3} className="p-8 text-center text-xs opacity-50 italic font-mono">No files found for selection</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Back: Transcriber Monthly Completed */}
              <Card 
                className="absolute inset-0 backface-hidden border-[#141414]/5 shadow-sm overflow-hidden bg-white"
                style={{ transform: 'rotateY(180deg)' }}
              >
                <CardHeader className="border-b border-[#141414]/5 bg-green-50">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-xs font-mono uppercase tracking-widest text-green-800">Transcriber Monthly Data (MTD)</CardTitle>
                    <Badge variant="outline" className="font-mono text-[8px] border-green-200 text-green-700">CURRENT MONTH</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-white z-10">
                        <tr className="border-b border-[#141414]/10">
                          <th className="p-3 text-[10px] font-mono uppercase opacity-50">Transcriber</th>
                          <th className="p-3 text-[10px] font-mono uppercase opacity-50 text-right">Mth Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#141414]/5">
                        {stats.monthlyTransCompleted.map((item, i) => (
                          <tr key={i} className="hover:bg-green-50/50 transition-colors">
                            <td className="p-3 text-xs font-medium">{item.name}</td>
                            <td className="p-3 text-xs font-mono text-right text-green-700 font-bold">{item.formatted}</td>
                          </tr>
                        ))}
                        {stats.monthlyTransCompleted.length === 0 && (
                          <tr>
                            <td colSpan={2} className="p-8 text-center text-xs opacity-50 italic font-mono">No monthly data available</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <div 
            className="relative h-[450px] perspective-1000 cursor-pointer group"
            onClick={() => setManualInspectorFlipped(!manualInspectorFlipped)}
          >
            <motion.div
              className="w-full h-full relative preserve-3d"
              animate={{ rotateY: isInspectorFlipped ? 180 : 0 }}
              transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
            >
              {/* Front: Files per Inspector */}
              <Card className="absolute inset-0 backface-hidden border-[#141414]/5 shadow-sm overflow-hidden bg-white">
                <CardHeader className="border-b border-[#141414]/5 bg-[#141414]/5">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-xs font-mono uppercase tracking-widest">Files per Inspector</CardTitle>
                    <span className="text-[8px] font-mono opacity-50 uppercase tracking-tighter">Click to flip</span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-white z-10">
                        <tr className="border-b border-[#141414]/10">
                          <th className="p-3 text-[10px] font-mono uppercase opacity-50">Inspector</th>
                          <th className="p-3 text-[10px] font-mono uppercase opacity-50 text-right">File Count</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#141414]/5">
                        {stats.inspectionsByInspector.map((item, i) => (
                          <tr key={i} className="hover:bg-[#141414]/5 transition-colors">
                            <td className="p-3 text-xs font-medium">{item.name}</td>
                            <td className="p-3 text-xs font-mono text-right">{item.value}</td>
                          </tr>
                        ))}
                        {stats.inspectionsByInspector.length === 0 && (
                          <tr>
                            <td colSpan={2} className="p-8 text-center text-xs opacity-50 italic font-mono">No data found for selection</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Back: Inspector All-Time Reports */}
              <Card 
                className="absolute inset-0 backface-hidden border-[#141414]/5 shadow-sm overflow-hidden bg-white"
                style={{ transform: 'rotateY(180deg)' }}
              >
                <CardHeader className="border-b border-[#141414]/5 bg-blue-50">
                  <CardTitle className="text-xs font-mono uppercase tracking-widest text-blue-800">Inspector All-Time Reports</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-white z-10">
                        <tr className="border-b border-[#141414]/10">
                          <th className="p-3 text-[10px] font-mono uppercase opacity-50">Inspector</th>
                          <th className="p-3 text-[10px] font-mono uppercase opacity-50 text-right">Total Reports</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#141414]/5">
                        {stats.allTimeInspectorTotal.map((item, i) => (
                          <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                            <td className="p-3 text-xs font-medium">{item.name}</td>
                            <td className="p-3 text-xs font-mono text-right text-blue-700 font-bold">{item.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>

        {/* Workload Matrix Section */}
        <section className="mt-8 mb-12">
          <div className="relative h-[600px] perspective-1000 cursor-pointer group">
            <motion.div
              className="w-full h-full relative preserve-3d"
              animate={{ rotateY: isWorkloadFlipped ? 180 : 0 }}
              transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
              onClick={() => setIsWorkloadFlipped(!isWorkloadFlipped)}
            >
              {/* Front Side: Contextual View */}
              <Card className="absolute inset-0 backface-hidden border-[#141414]/5 shadow-sm overflow-hidden bg-white">
                <CardHeader className="border-b border-[#141414]/5 bg-[#141414]/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xs font-mono uppercase tracking-widest">Workload Matrix</CardTitle>
                      <CardDescription className="text-[10px] uppercase tracking-tight mt-1">
                        {selectedDate ? "Daily Assignments" : "Monthly Assignments (MTD)"}
                        <span className="ml-2 opacity-50 italic">(Click to flip)</span>
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px] opacity-50">
                      {selectedDate ? format(selectedDate, 'MMM d') : 'Current Month'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[500px] w-full">
                    <div className="min-w-max">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-white z-20 shadow-sm">
                          <tr className="border-b border-[#141414]/10">
                            <th className="p-3 text-[10px] font-mono uppercase opacity-50 bg-white sticky left-0 z-30 border-r border-[#141414]/5">Inspector</th>
                            {stats.allUniqueTranscribers.map((trans, i) => (
                              <th key={i} className="p-3 text-[10px] font-mono uppercase opacity-50 text-center min-w-[120px] bg-white">
                                <div className="flex flex-col items-center">
                                  <span className="opacity-30 text-[8px] mb-0.5">Staff</span>
                                  <span>{trans}</span>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#141414]/5">
                          {stats.workloadTable.map((row, i) => (
                            <tr key={i} className="hover:bg-[#141414]/5 transition-colors">
                              <td className="p-3 text-xs font-medium bg-white sticky left-0 z-10 border-r border-[#141414]/5 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                {row.inspector}
                              </td>
                              {stats.allUniqueTranscribers.map((trans, j) => {
                                const val = row[trans];
                                const count = selectedDate ? val.daily : val.monthly;
                                return (
                                  <td key={j} className="p-3 text-xs font-mono text-center">
                                    {count > 0 ? (
                                      <span className={cn(
                                        "font-bold",
                                        selectedDate ? "text-blue-600" : "text-[#141414]"
                                      )}>
                                        {count}
                                      </span>
                                    ) : (
                                      <span className="opacity-10">-</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          {stats.workloadTable.length === 0 && (
                            <tr>
                              <td colSpan={stats.allUniqueTranscribers.length + 1} className="p-12 text-center text-xs opacity-50 italic font-mono">
                                No workload data available for this selection
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Back Side: Monthly View */}
              <Card 
                className="absolute inset-0 backface-hidden border-[#141414]/5 shadow-lg overflow-hidden bg-white"
                style={{ transform: 'rotateY(180deg)' }}
              >
                <CardHeader className="border-b border-green-100 bg-green-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xs font-mono uppercase tracking-widest text-green-800">Total Month Count (MTD)</CardTitle>
                      <CardDescription className="text-[10px] uppercase tracking-tight mt-1 text-green-700/70">
                        Total monthly assignments per transcriber
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px] border-green-200 text-green-700 bg-white">
                      {format(new Date(), 'MMMM yyyy')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[500px] w-full">
                    <div className="min-w-max">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-green-50 z-20 shadow-sm border-b border-green-200">
                          <tr>
                            <th className="p-3 text-[10px] font-mono uppercase opacity-50 bg-green-50 sticky left-0 z-30 border-r border-green-100 min-w-[150px]">Inspector</th>
                            {stats.allUniqueTranscribers.map((trans, i) => (
                              <th key={i} className="p-3 text-[10px] font-mono uppercase opacity-50 text-center min-w-[120px]">
                                {trans}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-green-100">
                          {stats.workloadTable.map((row, i) => (
                            <tr key={i} className="hover:bg-green-50/50 transition-colors">
                              <td className="p-3 text-xs font-medium bg-green-50 sticky left-0 z-10 border-r border-green-100">
                                {row.inspector}
                              </td>
                              {stats.allUniqueTranscribers.map((trans, j) => {
                                const val = row[trans];
                                const count = val.monthly;
                                return (
                                  <td key={j} className="p-3 text-xs font-mono text-center">
                                    {count > 0 ? (
                                      <span className="font-bold text-green-700">
                                        {count}
                                      </span>
                                    ) : (
                                      <span className="opacity-10">-</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Mobile Bottom Nav Hint */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 md:hidden z-50">
        <div className="bg-[#141414] text-[#E4E3E0] px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 border border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-widest">Live</span>
          </div>
          <div className="w-px h-3 bg-white/20" />
          <button 
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 hover:opacity-80 active:scale-95 transition-all"
          >
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
            <span className="text-[10px] font-mono uppercase tracking-widest">Sync</span>
          </button>
        </div>
      </div>
    </div>
  );
}
