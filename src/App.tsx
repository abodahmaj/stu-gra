/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  User, ArrowLeft, PieChart, Layers, Trophy, Crown, X, BarChart as BarChartIcon,
  Quote, Send, Download, Home, Printer, Search, Pointer, FolderOpen,
  BarChart2, Star, AlertTriangle, Medal, Activity, Mail, ChevronDown, ChevronUp
} from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { toPng } from 'html-to-image';
import { supabase } from './lib/supabase';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const DEFAULT_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRO0oHa5_iC7_Sqbj9_WMjHolHCfh7bICAe2X-SNZV7L9l7XvJDP6H4RWHBRW4DHBU5M5HZe_S2dRxw/pub?gid=1262059923&single=true&output=csv";

type Student = {
  name: string;
  tests: number;
  tasks: number;
  total: number;
  grade: string;
};

function parseCSV(csvText: string): Student[] {
  const lines = csvText.split("\n");
  const result: Student[] = [];
  let startIndex = lines[0] && lines[0].includes("الاسم") ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const row = lines[i].trim().split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (row.length >= 4) {
      const clean = (str: string) => {
        if (!str) return 0;
        let s = str.replace(/"/g, '').replace('٫', '.');
        return parseFloat(s) || 0;
      };
      const name = row[0]?.replace(/"/g, '').trim();
      const total = clean(row[3]);
      if (name && name !== "الاسم") {
        result.push({
          name: name,
          tests: clean(row[1]),
          tasks: clean(row[2]),
          total: total,
          grade: row[4] ? row[4].replace(/"/g, '').trim() : "غير محدد"
        });
      }
    }
  }
  return result;
}

function isStudentInGrade(studentGrade: string, targetGrade: string) {
  const g = studentGrade.trim();
  const t = targetGrade.trim();
  if (t === 'أول متوسط') return g.includes('أول') || g.includes('اول') || g.includes('1م');
  if (t === 'ثاني متوسط') return g.includes('ثاني') || g.includes('ثانى') || g.includes('2م');
  if (t === 'ثالث متوسط') return g.includes('ثالث') || g.includes('3م');
  return g === t;
}

function getLevel(score: number) {
  if (score >= 48) return { label: 'فوق المتوسط', bg: 'bg-brand-50', text: 'text-brand-600' };
  if (score >= 30) return { label: 'متوسط', bg: 'bg-blue-50', text: 'text-blue-600' };
  return { label: 'دون المتوسط', bg: 'bg-red-50', text: 'text-red-600' };
}

export default function App() {
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [view, setView] = useState<'landing' | 'app' | 'admin_login' | 'admin_dashboard'>('landing');
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'results' | 'global' | 'honor' | 'weakness'>('results');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'excellent' | 'average' | 'weak'>('all');
  
  const [showTop10, setShowTop10] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Admin state
  const [csvUrl, setCsvUrl] = useState(DEFAULT_CSV_URL);
  const [adminData, setAdminData] = useState<any>(null);
  const [adminUsernameInput, setAdminUsernameInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [newCsvUrl, setNewCsvUrl] = useState('');
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminSuccess, setAdminSuccess] = useState('');
  
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'save' | 'discard' | null>(null);

  const [showWelcome, setShowWelcome] = useState(true);
  const [isMetricsExpanded, setIsMetricsExpanded] = useState(false);

  useEffect(() => {
    if (selectedStudent) {
      setIsMetricsExpanded(false);
    }
  }, [selectedStudent]);

  useEffect(() => {
    if (view === 'landing') {
      setShowWelcome(true);
      const timer = setTimeout(() => setShowWelcome(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [view]);

  const hasUnsavedChanges = adminData 
    ? (newCsvUrl !== adminData.csv_url || newAdminUsername !== adminData.admin_username || newAdminPassword !== adminData.admin_password)
    : (newCsvUrl !== DEFAULT_CSV_URL || newAdminUsername !== 'admin' || newAdminPassword !== 'admin123');

  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchConfigAndData = async () => {
      try {
        const { data, error } = await supabase.from('stu_spreadsheet').select('*').limit(1).single();
        let currentCsvUrl = DEFAULT_CSV_URL;
        
        if (error) {
          console.warn("Supabase fetch error (might be empty or missing table):", error.message);
        }
        
        if (data) {
          setAdminData(data);
          currentCsvUrl = data.csv_url;
          setCsvUrl(currentCsvUrl);
        }
        
        const response = await fetch(currentCsvUrl);
        if (!response.ok) throw new Error("Network response was not ok");
        
        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let loaded = 0;
        
        const reader = response.body?.getReader();
        const decoder = new TextDecoder('utf-8');
        let text = '';
        
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            loaded += value.length;
            text += decoder.decode(value, { stream: true });
            if (total) {
              setLoadingProgress(Math.round((loaded / total) * 100));
            } else {
              setLoadingProgress(prev => Math.min(prev + 10, 90));
            }
          }
          text += decoder.decode(); // flush
        } else {
          text = await response.text();
        }
        
        setLoadingProgress(100);
        const parsed = parseCSV(text);
        setAllStudents(parsed);
      } catch (err) {
        console.error("Error fetching data:", err);
        alert("حدث خطأ في تحميل البيانات. يرجى التحقق من اتصال الإنترنت أو المصدر.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchConfigAndData();
  }, []);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    
    if (adminData) {
      if (adminData.admin_username === adminUsernameInput && adminData.admin_password === adminPasswordInput) {
        setNewCsvUrl(adminData.csv_url);
        setNewAdminUsername(adminData.admin_username);
        setNewAdminPassword(adminData.admin_password);
        setView('admin_dashboard');
      } else {
        setAdminError('بيانات الدخول غير صحيحة');
      }
    } else {
      // Fallback if database is empty or not connected yet
      if (adminUsernameInput === 'admin' && adminPasswordInput === 'admin123') {
        setNewCsvUrl(DEFAULT_CSV_URL);
        setNewAdminUsername('admin');
        setNewAdminPassword('admin123');
        setView('admin_dashboard');
      } else {
        setAdminError('بيانات الدخول غير صحيحة');
      }
    }
  };

  const handleAdminUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasUnsavedChanges) return;
    setConfirmAction('save');
    setShowConfirmDialog(true);
  };

  const handleAdminClose = () => {
    if (hasUnsavedChanges) {
      setConfirmAction('discard');
      setShowConfirmDialog(true);
    } else {
      setView('landing');
    }
  };

  const executeDiscard = () => {
    setShowConfirmDialog(false);
    if (adminData) {
      setNewCsvUrl(adminData.csv_url);
      setNewAdminUsername(adminData.admin_username);
      setNewAdminPassword(adminData.admin_password);
    } else {
      setNewCsvUrl(DEFAULT_CSV_URL);
      setNewAdminUsername('admin');
      setNewAdminPassword('admin123');
    }
    setView('landing');
  };

  const executeAdminUpdate = async () => {
    setAdminError('');
    setAdminSuccess('');
    setIsLoading(true);
    setShowConfirmDialog(false);
    try {
      if (adminData?.id) {
        const { error } = await supabase
          .from('stu_spreadsheet')
          .update({
            csv_url: newCsvUrl,
            admin_username: newAdminUsername,
            admin_password: newAdminPassword
          })
          .eq('id', adminData.id);
          
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('stu_spreadsheet')
          .insert([{
            csv_url: newCsvUrl,
            admin_username: newAdminUsername,
            admin_password: newAdminPassword
          }]);
          
        if (error) throw error;
      }
      
      setAdminSuccess('تم تحديث البيانات بنجاح! سيتم إعادة تحميل التطبيق...');
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      setAdminError(err.message || 'حدث خطأ أثناء التحديث');
      setIsLoading(false);
    }
  };

  const classStudents = selectedGrade === 'التحليل الشامل' 
    ? allStudents 
    : allStudents.filter(s => isStudentInGrade(s.grade, selectedGrade));

  const filteredStudents = classStudents.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
    let matchesFilter = true;
    if (filter === 'excellent') matchesFilter = s.total >= 48;
    else if (filter === 'average') matchesFilter = s.total >= 30 && s.total < 48;
    else if (filter === 'weak') matchesFilter = s.total < 30;
    return matchesSearch && matchesFilter;
  });

  const enterApp = (grade: string) => {
    setSelectedGrade(grade);
    setView('app');
    setActiveTab('results');
    setSearchQuery('');
    setFilter('all');
  };

  const enterGlobalAnalysis = () => {
    setSelectedGrade('التحليل الشامل');
    setView('app');
    setActiveTab('global');
  };

  const saveCardAsImage = () => {
    if (cardRef.current && selectedStudent) {
      const element = cardRef.current;
      const actionButtons = element.querySelector('.no-print-card') as HTMLElement;
      if (actionButtons) actionButtons.style.display = 'none';

      toPng(element, { backgroundColor: "#ffffff", pixelRatio: 2 })
        .then(dataUrl => {
          if (actionButtons) actionButtons.style.display = 'flex';
          const link = document.createElement('a');
          link.download = `نتيجة_${selectedStudent.name}.png`;
          link.href = dataUrl;
          link.click();
        })
        .catch(e => {
          console.error("Capture failed:", e);
          alert("تعذر حفظ الصورة، يرجى المحاولة مرة أخرى.");
          if (actionButtons) actionButtons.style.display = 'flex';
        });
    }
  };

  const shareViaWhatsapp = () => {
    if (!selectedStudent) return;
    const text = `السلام عليكم، نتيجة الطالب: ${selectedStudent.name} في مادة العلوم هي: ${selectedStudent.total} من 60. التقدير: ${getLevel(selectedStudent.total).label}.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareViaEmail = () => {
    if (!selectedStudent) return;
    const subject = `نتيجة الطالب: ${selectedStudent.name}`;
    const body = `السلام عليكم ورحمة الله وبركاته،\n\nنود إعلامكم بنتيجة الطالب: ${selectedStudent.name} في مادة العلوم.\n\nالمجموع الكلي: ${selectedStudent.total} من 60\nالتقدير: ${getLevel(selectedStudent.total).label}\n\nمع تمنياتنا بدوام التوفيق والنجاح.`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-pattern flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 border-2 border-black paper-shadow flex flex-col items-center max-w-sm w-full animate-slide-up">
          <div className="w-16 h-16 border-4 border-gray-200 border-t-black rounded-full animate-spin mb-6"></div>
          <h2 className="text-xl font-black text-black mb-2">جاري تحميل البيانات...</h2>
          <p className="text-sm text-gray-600 font-bold text-center mb-4">يرجى الانتظار بينما نقوم بجلب وتحليل بيانات الطلاب</p>
          
          <div className="w-full bg-gray-200 border-2 border-black h-4 relative overflow-hidden" dir="ltr">
            <div 
              className="bg-paper-green h-full border-r-2 border-black transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
          <p className="text-xs font-bold mt-2 text-black">{loadingProgress}%</p>
        </div>
      </div>
    );
  }

  // Calculate Global Stats
  const globalAvg = allStudents.length ? allStudents.reduce((a, b) => a + b.total, 0) / allStudents.length : 0;
  const globalExc = allStudents.length ? (allStudents.filter(s => s.total >= 48).length / allStudents.length) * 100 : 0;
  const top10 = [...allStudents].sort((a, b) => b.total - a.total).slice(0, 10);

  return (
    <div className="min-h-screen bg-pattern text-slate-900 overflow-x-hidden">
      <div className="print:hidden">
        {view === 'landing' && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-y-auto overflow-x-hidden bg-pattern">
          {showWelcome && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[60] bg-paper-yellow border-2 border-black px-6 py-3 paper-shadow animate-slide-up text-center w-max max-w-[90%] transition-opacity duration-500">
              <p className="font-black text-black text-sm">أهلاً بك في نظام كشوف المتابعة!</p>
            </div>
          )}
          <button onClick={() => setView('admin_login')} className="absolute top-4 left-4 z-20 w-10 h-10 bg-white border-2 border-black flex items-center justify-center text-black paper-btn shadow-none">
            <User size={18} />
          </button>
          <div className="relative z-10 flex flex-col min-h-full px-6 pt-12 pb-6">
            <div className="text-center mb-10 animate-slide-up">
              <div className="bg-white w-28 h-28 mx-auto rounded-full p-4 mb-4 flex items-center justify-center paper-border paper-shadow">
                <img src="https://i.ibb.co/zWHsNXvC/image.png" alt="Logo" className="w-full h-full object-contain" />
              </div>
              <h1 className="text-3xl font-black mb-2 tracking-tight">مجمع الثقافة التعليمي</h1>
              <p className="text-gray-600 text-sm font-bold opacity-90 tracking-wide bg-white inline-block px-2 border-2 border-black paper-shadow-sm">كشوف المتابعة | 1447</p>
              <div className="mt-6 inline-flex items-center gap-2 bg-gray-100 px-5 py-2 rounded-sm text-xs font-bold border-2 border-black paper-shadow-sm">
                <User size={14} /> معلم العلوم: علي جبريل
              </div>
            </div>

            <div className="w-full max-w-md mx-auto space-y-4 mb-10">
              <p className="text-center text-gray-700 text-xs font-black mb-4 uppercase tracking-wider underline decoration-2 decoration-black">اختر الصف الدراسي</p>
              
              {['أول متوسط', 'ثاني متوسط', 'ثالث متوسط'].map((grade, i) => (
                <button key={grade} onClick={() => enterApp(grade)} className="group w-full bg-white p-4 paper-btn flex items-center gap-5 animate-slide-up" style={{ animationDelay: `${(i+1)*0.1}s` }}>
                  <div className={`w-12 h-12 flex items-center justify-center font-black text-xl border-2 border-black ${i === 0 ? 'bg-paper-yellow text-black' : i === 1 ? 'bg-paper-blue text-white' : 'bg-paper-red text-white'}`}>
                    {i + 1}
                  </div>
                  <div className="text-right flex-1">
                    <h3 className="font-bold text-black text-lg">{grade}</h3>
                    <p className="text-[10px] text-gray-600 font-bold">عرض التقارير والنتائج</p>
                  </div>
                  <ArrowLeft className="text-black transition-transform group-hover:-translate-x-1" />
                </button>
              ))}
            </div>

            <div className="w-full max-w-md mx-auto bg-white p-6 paper-card animate-slide-up" style={{ animationDelay: '0.4s' }}>
              <div className="flex justify-between items-center mb-5 border-b-2 border-black pb-2">
                <h3 className="text-sm font-black text-black flex items-center gap-2">
                  <PieChart size={16} /> إحصائيات عامة
                </h3>
                <div className="flex gap-2">
                  <button onClick={enterGlobalAnalysis} className="bg-black text-white text-[10px] font-bold px-4 py-2 paper-btn shadow-none hover:bg-gray-800 flex items-center gap-1">
                    <Layers size={12} /> التحليل الشامل
                  </button>
                  <button onClick={() => setShowTop10(true)} className="bg-paper-yellow text-black w-9 h-9 flex items-center justify-center paper-btn shadow-none">
                    <Trophy size={14} />
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-100 p-4 text-center border-2 border-black">
                  <div className="text-[10px] text-gray-600 font-bold mb-1">المتوسط العام</div>
                  <div className="text-2xl font-black text-black">{globalAvg.toFixed(1)}</div>
                </div>
                <div className="bg-paper-green p-4 text-center border-2 border-black">
                  <div className="text-[10px] text-black font-bold mb-1">نسبة التميز</div>
                  <div className="text-2xl font-black text-white">{Math.round(globalExc)}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'app' && (
        <div className="min-h-screen flex-col mobile-container">
          <header className="sticky top-0 z-40 bg-white border-b-2 border-black">
            <div className="px-4 py-3 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <button onClick={() => setView('landing')} className="w-10 h-10 bg-white border-2 border-black flex items-center justify-center text-black paper-btn shadow-none">
                  <Home size={18} />
                </button>
                <div>
                  <h2 className="text-sm font-black text-black">{selectedGrade}</h2>
                  <span className="text-[10px] bg-paper-yellow text-black px-2 py-0.5 border-2 border-black font-bold">بوابة النتائج</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedGrade !== 'التحليل الشامل' && (
                  <button onClick={() => window.print()} className="h-10 px-3 bg-white border-2 border-black flex items-center justify-center text-black paper-btn shadow-none gap-2 font-bold text-xs">
                    <Printer size={16} /> <span className="hidden sm:inline">طباعة الكل</span>
                  </button>
                )}
              </div>
            </div>
            <div className="flex px-4 overflow-x-auto no-scrollbar gap-3 pb-3 pt-2 bg-gray-100 border-b-2 border-black">
              {selectedGrade !== 'التحليل الشامل' && (
                <button onClick={() => setActiveTab('results')} className={`px-4 py-2 text-xs font-bold border-2 border-black paper-btn shadow-none whitespace-nowrap ${activeTab === 'results' ? 'bg-paper-blue text-white' : 'bg-white text-black'}`}>النتائج</button>
              )}
              {selectedGrade === 'التحليل الشامل' && (
                <button onClick={() => setActiveTab('global')} className={`px-4 py-2 text-xs font-bold border-2 border-black paper-btn shadow-none whitespace-nowrap ${activeTab === 'global' ? 'bg-paper-blue text-white' : 'bg-white text-black'}`}>التحليل الشامل</button>
              )}
              <button onClick={() => setActiveTab('honor')} className={`px-4 py-2 text-xs font-bold border-2 border-black paper-btn shadow-none whitespace-nowrap ${activeTab === 'honor' ? 'bg-paper-blue text-white' : 'bg-white text-black'}`}>لوحة الشرف</button>
              <button onClick={() => setActiveTab('weakness')} className={`px-4 py-2 text-xs font-bold border-2 border-black paper-btn shadow-none whitespace-nowrap ${activeTab === 'weakness' ? 'bg-paper-blue text-white' : 'bg-white text-black'}`}>الفقد المهاري</button>
            </div>
          </header>

          <main className="flex-grow px-4 py-6 w-full max-w-3xl mx-auto space-y-8">
            {activeTab === 'results' && selectedGrade !== 'التحليل الشامل' && (
              <section className="animate-slide-up">
                <div className="relative mb-4">
                  <input 
                    type="text" 
                    placeholder="ابحث باسم الطالب..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-12 pr-12 pl-4 bg-white border-2 border-black focus:bg-yellow-50 outline-none text-sm font-bold transition-all placeholder:font-normal paper-shadow-sm"
                  />
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-black text-lg" size={18} />
                </div>

                <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4 pb-2">
                  <button onClick={() => setFilter('all')} className={`px-4 py-1 text-xs font-bold whitespace-nowrap border-2 border-black paper-btn shadow-none ${filter === 'all' ? 'bg-black text-white' : 'bg-white text-black'}`}>الكل</button>
                  <button onClick={() => setFilter('excellent')} className={`px-4 py-1 text-xs font-bold whitespace-nowrap border-2 border-black paper-btn shadow-none ${filter === 'excellent' ? 'bg-black text-white' : 'bg-white text-green-700'}`}>🟢 المتفوقين</button>
                  <button onClick={() => setFilter('average')} className={`px-4 py-1 text-xs font-bold whitespace-nowrap border-2 border-black paper-btn shadow-none ${filter === 'average' ? 'bg-black text-white' : 'bg-white text-blue-700'}`}>🔵 المستوى المتوسط</button>
                  <button onClick={() => setFilter('weak')} className={`px-4 py-1 text-xs font-bold whitespace-nowrap border-2 border-black paper-btn shadow-none ${filter === 'weak' ? 'bg-black text-white' : 'bg-white text-red-700'}`}>🔴 يحتاجون دعم</button>
                </div>
                
                <div className="flex justify-between items-center mb-4 px-2">
                  <p className="text-[10px] text-black font-bold flex items-center gap-1"><Pointer size={12} /> اضغط على البطاقة</p>
                  <span className="text-[10px] bg-white border-2 border-black text-black px-3 py-1 font-bold">العدد: <span>{filteredStudents.length}</span></span>
                </div>

                <div className="space-y-4 pb-10">
                  {filteredStudents.map(s => (
                    <div key={s.name} onClick={() => setSelectedStudent(s)} className="bg-white p-5 paper-card flex items-center justify-between cursor-pointer active:scale-[0.99]">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white flex items-center justify-center font-bold text-lg border-2 border-black">{s.name.charAt(0)}</div>
                        <div>
                          <h4 className="font-bold text-sm text-black mb-1">{s.name}</h4>
                          <div className="flex gap-4 text-[10px] font-bold text-gray-600">
                            <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-paper-blue border border-black"></span>اختبار: <span className="text-black">{s.tests}</span></div>
                            <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-paper-yellow border border-black"></span>مهام: <span className="text-black">{s.tasks}</span></div>
                          </div>
                        </div>
                      </div>
                      <div className="text-center pl-2 border-l-2 border-black ml-2">
                        <div className="text-2xl font-black text-black leading-none tracking-tight">{s.total}</div>
                        <div className="text-[9px] text-gray-500 font-bold mt-1">المجموع</div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {filteredStudents.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <FolderOpen size={48} className="mb-4 text-gray-300" />
                    <p className="text-sm font-bold text-black">لا توجد نتائج مطابقة</p>
                  </div>
                )}
              </section>
            )}

            {activeTab === 'global' && selectedGrade === 'التحليل الشامل' && (
              <GlobalAnalysisView allStudents={allStudents} />
            )}

            {activeTab === 'honor' && (
              <section className="animate-slide-up">
                <div className="bg-paper-yellow p-8 text-black text-center mb-8 border-2 border-black paper-shadow">
                  <Medal size={48} className="mx-auto mb-4" />
                  <h2 className="text-2xl font-black">لوحة المتميزين</h2>
                  <p className="text-black text-xs mt-2 font-bold opacity-90">الطلاب الحاصلون على تقدير "فوق المتوسط"</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {classStudents.filter(s => s.total >= 48).sort((a, b) => b.total - a.total).map((s, i) => (
                    <div key={s.name} className="bg-white p-3 text-center paper-card relative">
                      {i < 3 && <div className="absolute top-0 right-0 p-1 text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>}
                      <div className="w-10 h-10 mx-auto bg-paper-yellow text-black flex items-center justify-center font-bold mb-2 border-2 border-black">{s.name.charAt(0)}</div>
                      <h4 className="font-bold text-xs text-black truncate">{s.name}</h4>
                      <span className="inline-block mt-1 bg-black text-white text-[10px] font-bold px-2">{s.total}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'weakness' && (
              <section className="animate-slide-up">
                <div className="bg-white p-6 paper-card">
                  <h3 className="font-black text-black mb-6 flex items-center gap-3 border-b-2 border-black pb-2">
                    <span className="w-10 h-10 bg-paper-red text-white flex items-center justify-center border-2 border-black"><Activity size={20} /></span>
                    تحليل الفقد المهاري
                  </h3>
                  
                  <div className="space-y-6">
                    <div className="border-2 border-black p-4 bg-gray-50">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-xs font-bold text-red-700">دون المتوسط (كلي)</span>
                        <span className="bg-paper-red text-white text-[10px] font-black px-3 py-1 border-2 border-black">{classStudents.filter(s => s.total < 30).length}</span>
                      </div>
                      <div className="space-y-2">
                        {classStudents.filter(s => s.total < 30).map(s => (
                          <div key={s.name} className="flex justify-between p-2 bg-white border-2 border-black mb-2 text-xs">
                            <span className="font-bold text-black">{s.name}</span>
                            <span className="font-bold text-red-600">{s.total} / 60</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-2 border-black p-4 bg-white">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-xs font-bold text-orange-700">ضعف في الاختبارات</span>
                        <span className="bg-orange-500 text-white text-[10px] font-black px-3 py-1 border-2 border-black">{classStudents.filter(s => s.tests < 10).length}</span>
                      </div>
                      <div className="space-y-2">
                        {classStudents.filter(s => s.tests < 10).map(s => (
                          <div key={s.name} className="flex justify-between p-2 bg-white border-2 border-black mb-2 text-xs">
                            <span className="font-bold text-black">{s.name}</span>
                            <span className="font-bold text-red-600">{s.tests} / 20</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-2 border-black p-4 bg-white">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-xs font-bold text-yellow-700">ضعف في المهام</span>
                        <span className="bg-paper-yellow text-black text-[10px] font-black px-3 py-1 border-2 border-black">{classStudents.filter(s => s.tasks < 20).length}</span>
                      </div>
                      <div className="space-y-2">
                        {classStudents.filter(s => s.tasks < 20).map(s => (
                          <div key={s.name} className="flex justify-between p-2 bg-white border-2 border-black mb-2 text-xs">
                            <span className="font-bold text-black">{s.name}</span>
                            <span className="font-bold text-red-600">{s.tasks} / 40</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </main>
        </div>
      )}

      {/* Top 10 Modal */}
      {showTop10 && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setShowTop10(false)}></div>
          <div className="absolute bottom-0 left-0 right-0 bg-white border-t-2 border-black h-[85vh] flex flex-col shadow-[0_-10px_0_0_rgba(0,0,0,1)] animate-slide-up">
            <div className="p-6 border-b-2 border-black flex justify-between items-center bg-paper-yellow">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white flex items-center justify-center text-black border-2 border-black shadow-[2px_2px_0_0_black]"><Crown size={24} /></div>
                <div>
                  <h3 className="text-xl font-black text-black">قائمة النخبة</h3>
                  <p className="text-xs text-black font-bold">أعلى الدرجات على مستوى المدرسة</p>
                </div>
              </div>
              <button onClick={() => setShowTop10(false)} className="w-10 h-10 bg-white border-2 border-black text-black hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center font-bold"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {top10.map((s, i) => (
                <div key={s.name} className="flex items-center gap-3 p-3 bg-white border-2 border-black paper-shadow-sm">
                  <div className="w-8 h-8 flex items-center justify-center font-black text-xs bg-paper-yellow border-2 border-black">#{i + 1}</div>
                  <div className="flex-1">
                    <h4 className="text-xs font-bold text-black">{s.name}</h4>
                    <span className="text-[9px] text-gray-600 font-bold">{s.grade}</span>
                  </div>
                  <div className="font-black text-black">{s.total}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Student Card Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-[80] overflow-y-auto">
          <div className="min-h-screen px-4 text-center flex items-center justify-center">
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={() => setSelectedStudent(null)}></div>
            
            <div className="inline-block w-full max-w-sm p-4 my-8 transition-all relative z-50">
              <div className="bg-white paper-card relative cursor-pointer" ref={cardRef} onClick={() => setIsMetricsExpanded(!isMetricsExpanded)}>
                <button onClick={(e) => { e.stopPropagation(); setSelectedStudent(null); }} className="absolute top-4 left-4 z-20 w-8 h-8 bg-white border-2 border-black text-black flex items-center justify-center hover:bg-red-500 hover:text-white no-print-card"><X size={16} /></button>

                <div className="bg-paper-green pt-10 pb-16 px-6 text-black text-center relative border-b-2 border-black">
                  <div className="w-24 h-24 mx-auto bg-white flex items-center justify-center text-4xl font-black text-black mb-4 border-2 border-black shadow-[4px_4px_0_0_black] relative z-10">{selectedStudent.name.charAt(0)}</div>
                  <h2 className="text-2xl font-black mb-1 relative z-10 truncate px-2">{selectedStudent.name}</h2>
                  <span className="text-xs bg-white px-4 py-1.5 font-bold border-2 border-black relative z-10">{selectedStudent.grade}</span>
                </div>

                <div className="bg-white relative z-20 px-6 pt-8 pb-6">
                  <div className="text-center mb-8">
                    <div className="inline-flex flex-col items-center">
                      <span className="text-xs text-black font-black uppercase tracking-widest mb-1 underline decoration-2">المجموع الكلي</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-6xl font-black text-black tracking-tighter">{selectedStudent.total}</span>
                        <span className="text-xl text-gray-500 font-bold">/60</span>
                      </div>
                      <div className={`mt-2 px-4 py-1 text-xs font-bold border-2 border-black bg-white shadow-[2px_2px_0_0_black] ${getLevel(selectedStudent.total).text}`}>
                        {getLevel(selectedStudent.total).label}
                      </div>
                    </div>
                  </div>

                  <div className="mb-8">
                    <div className="flex justify-between items-end mb-3 px-2 border-b-2 border-black pb-1">
                      <h4 className="text-xs font-bold text-black flex items-center gap-1"><BarChartIcon size={14} /> تحليل الأداء</h4>
                      <div className="text-gray-500">
                        {isMetricsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                    
                    <div 
                      className={`relative w-full bg-white border-black transition-all duration-300 ease-in-out overflow-hidden ${
                        isMetricsExpanded 
                          ? 'h-40 p-4 border-2 shadow-[2px_2px_0_0_black] opacity-100 mt-2' 
                          : 'h-0 p-0 border-0 shadow-none opacity-0 mt-0'
                      }`}
                    >
                      <StudentChart student={selectedStudent} allStudents={allStudents} />
                    </div>
                  </div>

                  <div className="bg-gray-100 p-5 border-2 border-black mb-6">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 bg-white flex items-center justify-center text-black border-2 border-black shrink-0"><Quote size={14} /></div>
                      <div>
                        <h5 className="text-xs font-bold text-black mb-1">رأي المعلم:</h5>
                        <p className="text-xs text-black leading-relaxed font-medium">
                          {selectedStudent.total >= 54 ? "أداء استثنائي! استمر في هذا التميز." :
                           selectedStudent.tests < 10 ? "يحتاج الطالب إلى تركيز أكبر على المذاكرة للاختبارات." :
                           selectedStudent.tasks < 15 ? "يرجى الاهتمام بتسليم المهام والمشاركة الصفية." :
                           "مستوى جيد، يمكن الوصول لمراتب التميز بقليل من الجهد."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mb-6 px-2 text-[10px] font-bold text-gray-500">
                    <span>الصف: {selectedStudent.grade}</span>
                    <span>تاريخ الإصدار: {new Date().toLocaleDateString('ar-SA')}</span>
                  </div>

                  <div className="flex gap-2 no-print-card" onClick={(e) => e.stopPropagation()}>
                    <button onClick={shareViaWhatsapp} className="flex-1 bg-paper-green hover:bg-brand-600 text-white font-bold py-3 paper-btn shadow-none flex items-center justify-center gap-2 text-sm border-2 border-black">
                      <Send size={16} /> واتساب
                    </button>
                    <button onClick={shareViaEmail} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 paper-btn shadow-none flex items-center justify-center gap-2 text-sm border-2 border-black">
                      <Mail size={16} /> إيميل
                    </button>
                    <button onClick={saveCardAsImage} className="flex-1 bg-black hover:bg-gray-800 text-white font-bold py-3 paper-btn shadow-none flex items-center justify-center gap-2 text-sm border-2 border-black">
                      <Download size={16} /> حفظ
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'admin_login' && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6 bg-pattern">
          <button onClick={() => setView('landing')} className="absolute top-4 right-4 z-20 w-10 h-10 bg-white border-2 border-black flex items-center justify-center text-black paper-btn shadow-none">
            <X size={18} />
          </button>
          <div className="w-full max-w-md bg-white p-8 paper-card animate-slide-up">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto bg-black text-white flex items-center justify-center rounded-full mb-4 border-2 border-black">
                <User size={32} />
              </div>
              <h2 className="text-2xl font-black text-black">تسجيل دخول الإدارة</h2>
            </div>
            
            {adminError && <div className="bg-red-100 text-red-700 p-3 mb-4 border-2 border-black text-sm font-bold text-center">{adminError}</div>}
            
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-black mb-1">اسم المستخدم</label>
                <input 
                  type="text" 
                  value={adminUsernameInput}
                  onChange={(e) => setAdminUsernameInput(e.target.value)}
                  className="w-full h-12 px-4 bg-white border-2 border-black focus:bg-yellow-50 outline-none text-sm font-bold"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-black mb-1">كلمة المرور</label>
                <input 
                  type="password" 
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  className="w-full h-12 px-4 bg-white border-2 border-black focus:bg-yellow-50 outline-none text-sm font-bold"
                  required
                />
              </div>
              <button type="submit" className="w-full h-12 bg-black text-white font-bold border-2 border-black paper-btn shadow-none mt-4">
                دخول
              </button>
            </form>
          </div>
        </div>
      )}

      {view === 'admin_dashboard' && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-y-auto p-6 bg-pattern">
          <div className="w-full max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-black flex items-center gap-2">
                <User size={24} /> لوحة التحكم
              </h2>
              <button onClick={handleAdminClose} className="w-10 h-10 bg-white border-2 border-black flex items-center justify-center text-black paper-btn shadow-none">
                <Home size={18} />
              </button>
            </div>
            
            <div className="bg-white p-8 paper-card animate-slide-up">
              <div className="flex justify-between items-center mb-6 border-b-2 border-black pb-2">
                <h3 className="text-lg font-bold text-black">إعدادات التطبيق</h3>
                {hasUnsavedChanges && (
                  <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 border-2 border-black">
                    تغييرات غير محفوظة
                  </span>
                )}
              </div>
              
              {adminError && <div className="bg-red-100 text-red-700 p-3 mb-4 border-2 border-black text-sm font-bold text-center">{adminError}</div>}
              {adminSuccess && <div className="bg-green-100 text-green-700 p-3 mb-4 border-2 border-black text-sm font-bold text-center">{adminSuccess}</div>}
              
              <form onSubmit={handleAdminUpdate} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-black mb-1">رابط ملف Google Sheets (CSV)</label>
                  <input 
                    type="url" 
                    value={newCsvUrl}
                    onChange={(e) => setNewCsvUrl(e.target.value)}
                    className={`w-full h-12 px-4 bg-white border-2 border-black focus:bg-yellow-50 outline-none text-sm font-bold ${adminData && newCsvUrl !== adminData.csv_url ? 'bg-yellow-50' : ''}`}
                    required
                    dir="ltr"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">يجب أن يكون الرابط بصيغة CSV (Publish to web)</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-black mb-1">اسم مستخدم الإدارة الجديد</label>
                    <input 
                      type="text" 
                      value={newAdminUsername}
                      onChange={(e) => setNewAdminUsername(e.target.value)}
                      className={`w-full h-12 px-4 bg-white border-2 border-black focus:bg-yellow-50 outline-none text-sm font-bold ${adminData && newAdminUsername !== adminData.admin_username ? 'bg-yellow-50' : ''}`}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-black mb-1">كلمة مرور الإدارة الجديدة</label>
                    <input 
                      type="text" 
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      className={`w-full h-12 px-4 bg-white border-2 border-black focus:bg-yellow-50 outline-none text-sm font-bold ${adminData && newAdminPassword !== adminData.admin_password ? 'bg-yellow-50' : ''}`}
                      required
                    />
                  </div>
                </div>
                
                <button 
                  type="submit" 
                  disabled={!hasUnsavedChanges}
                  className={`w-full h-12 font-bold border-2 border-black paper-btn shadow-none mt-4 ${hasUnsavedChanges ? 'bg-paper-green text-black' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
                >
                  حفظ التغييرات
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowConfirmDialog(false)}></div>
          <div className="bg-white border-2 border-black p-6 w-full max-w-sm relative z-10 paper-card animate-slide-up text-center">
            <h3 className="text-xl font-black text-black mb-2">
              {confirmAction === 'save' ? 'تأكيد الحفظ' : 'تجاهل التغييرات'}
            </h3>
            <p className="text-sm text-gray-700 font-bold mb-6">
              {confirmAction === 'save' 
                ? 'هل أنت متأكد من حفظ هذه التغييرات؟ سيؤدي هذا إلى تحديث إعدادات التطبيق.' 
                : 'لديك تغييرات غير محفوظة. هل أنت متأكد من رغبتك في تجاهلها والعودة للرئيسية؟'}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowConfirmDialog(false)} 
                className="flex-1 h-10 bg-white border-2 border-black text-black font-bold paper-btn shadow-none"
              >
                إلغاء
              </button>
              <button 
                onClick={confirmAction === 'save' ? executeAdminUpdate : executeDiscard} 
                className={`flex-1 h-10 border-2 border-black text-white font-bold paper-btn shadow-none ${confirmAction === 'save' ? 'bg-paper-green text-black' : 'bg-red-500'}`}
              >
                {confirmAction === 'save' ? 'تأكيد الحفظ' : 'تجاهل'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Print View */}
      <div className="hidden print:block bg-white w-full">
        {view === 'app' && selectedGrade !== 'التحليل الشامل' && classStudents.map(student => (
          <PrintableStudentCard key={student.name} student={student} allStudents={allStudents} />
        ))}
      </div>
    </div>
  );
}

function PrintableStudentCard({ student, allStudents }: { student: Student, allStudents: Student[] }) {
  return (
    <div className="bg-white relative break-after-page mb-8 print:shadow-none print:border-0 print:mb-0 w-full max-w-2xl mx-auto" style={{ pageBreakAfter: 'always' }}>
      <div className="bg-paper-green pt-10 pb-16 px-6 text-black text-center relative border-b-2 border-black">
        <div className="w-24 h-24 mx-auto bg-white flex items-center justify-center text-4xl font-black text-black mb-4 border-2 border-black shadow-[4px_4px_0_0_black] print:shadow-none relative z-10">{student.name.charAt(0)}</div>
        <h2 className="text-2xl font-black mb-1 relative z-10 truncate px-2">{student.name}</h2>
        <span className="text-xs bg-white px-4 py-1.5 font-bold border-2 border-black relative z-10">{student.grade}</span>
      </div>

      <div className="bg-white relative z-20 px-6 pt-8 pb-6 border-2 border-t-0 border-black">
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center">
            <span className="text-xs text-black font-black uppercase tracking-widest mb-1 underline decoration-2">المجموع الكلي</span>
            <div className="flex items-baseline gap-1">
              <span className="text-6xl font-black text-black tracking-tighter">{student.total}</span>
              <span className="text-xl text-gray-500 font-bold">/60</span>
            </div>
            <div className={`mt-2 px-4 py-1 text-xs font-bold border-2 border-black bg-white shadow-[2px_2px_0_0_black] print:shadow-none ${getLevel(student.total).text}`}>
              {getLevel(student.total).label}
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-end mb-3 px-2 border-b-2 border-black pb-1">
            <h4 className="text-xs font-bold text-black flex items-center gap-1"><BarChartIcon size={14} /> تحليل الأداء</h4>
          </div>
          <div className="relative h-40 w-full bg-white p-4 border-2 border-black shadow-[2px_2px_0_0_black] print:shadow-none">
            <StudentChart student={student} allStudents={allStudents} />
          </div>
        </div>

        <div className="bg-gray-100 p-5 border-2 border-black mb-6">
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-white flex items-center justify-center text-black border-2 border-black shrink-0"><Quote size={14} /></div>
            <div>
              <h5 className="text-xs font-bold text-black mb-1">رأي المعلم:</h5>
              <p className="text-xs text-black leading-relaxed font-medium">
                {student.total >= 54 ? "أداء استثنائي! استمر في هذا التميز." :
                 student.tests < 10 ? "يحتاج الطالب إلى تركيز أكبر على المذاكرة للاختبارات." :
                 student.tasks < 15 ? "يرجى الاهتمام بتسليم المهام والمشاركة الصفية." :
                 "مستوى جيد، يمكن الوصول لمراتب التميز بقليل من الجهد."}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-2 px-2 text-[10px] font-bold text-gray-500">
          <span>الصف: {student.grade}</span>
          <span>تاريخ الإصدار: {new Date().toLocaleDateString('ar-SA')}</span>
        </div>
      </div>
    </div>
  );
}

function StudentChart({ student, allStudents }: { student: Student, allStudents: Student[] }) {
  const peers = allStudents.filter(s => isStudentInGrade(s.grade, student.grade));
  const avgTests = peers.length ? peers.reduce((a, b) => a + b.tests, 0) / peers.length : 0;
  const avgTasks = peers.length ? peers.reduce((a, b) => a + b.tasks, 0) / peers.length : 0;
  const avgTotal = peers.length ? peers.reduce((a, b) => a + b.total, 0) / peers.length : 0;

  const data = {
    labels: ['المجموع', 'المهام', 'الاختبارات'],
    datasets: [
      { 
        label: 'درجة الطالب', 
        data: [student.total, student.tasks, student.tests], 
        backgroundColor: '#2ecc71', 
        borderColor: '#000', 
        borderWidth: 2, 
        barPercentage: 0.6 
      },
      { 
        label: 'متوسط الفصل', 
        data: [avgTotal, avgTasks, avgTests], 
        backgroundColor: '#95a5a6', 
        borderColor: '#000', 
        borderWidth: 2, 
        barPercentage: 0.6 
      }
    ]
  };

  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: { beginAtZero: true, grid: { display: false }, ticks: { font: { family: 'Tajawal' }, color: '#000' } },
      y: { grid: { display: false }, ticks: { font: { family: 'Tajawal', weight: 'bold' as const }, color: '#000' } }
    },
    plugins: {
      legend: { position: 'bottom' as const, labels: { font: { family: 'Tajawal' }, color: '#000' } }
    }
  };

  return <Bar data={data} options={options} />;
}

function GlobalAnalysisView({ allStudents }: { allStudents: Student[] }) {
  const sortedGlobal = [...allStudents].sort((a, b) => b.total - a.total).slice(0, 3);
  const allExcellent = allStudents.filter(s => s.total >= 48).sort((a, b) => b.total - a.total);
  const allWeak = allStudents.filter(s => s.total < 30).sort((a, b) => a.total - b.total);

  const grades = ['أول متوسط', 'ثاني متوسط', 'ثالث متوسط'];
  const gradeStats = grades.map(grade => {
    const students = allStudents.filter(s => isStudentInGrade(s.grade, grade));
    if (students.length === 0) return null;
    const avg = students.reduce((a, b) => a + b.total, 0) / students.length;
    const exc = (students.filter(s => s.total >= 48).length / students.length) * 100;
    const weakTotal = students.filter(s => s.total < 30).length;
    const weakTest = students.filter(s => s.tests < 10).length;
    const weakTask = students.filter(s => s.tasks < 20).length;
    return { grade, avg, exc, weakTotal, weakTest, weakTask };
  }).filter(Boolean) as any[];

  const chartData = {
    labels: gradeStats.map(g => g.grade),
    datasets: [
      { label: 'المتوسط', data: gradeStats.map(g => g.avg), backgroundColor: '#4169e1', borderColor: '#000', borderWidth: 2 },
      { label: 'نسبة التميز %', data: gradeStats.map(g => g.exc), backgroundColor: '#2ecc71', borderColor: '#000', borderWidth: 2 }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { beginAtZero: true, grid: { color: '#000', lineWidth: 1 }, ticks: { color: '#000', font: { family: 'Tajawal' } } },
      x: { grid: { display: false }, ticks: { color: '#000', font: { family: 'Tajawal' } } }
    },
    plugins: { legend: { labels: { font: { family: 'Tajawal' }, color: '#000' } } }
  };

  return (
    <section className="animate-slide-up">
      <div className="bg-black border-2 border-black p-8 card-shadow mb-8 text-white text-center relative overflow-hidden">
        <h3 className="font-black text-paper-yellow text-lg mb-8 relative z-10 tracking-wide uppercase border-b-2 border-white/20 pb-2 inline-block">
          نخبة التميز المدرسي <Crown className="inline ml-2" size={20} />
        </h3>
        <div className="flex justify-center items-end gap-3 md:gap-8 relative z-10 min-h-[180px]">
          {sortedGlobal.map((s, i) => {
            const rank = i + 1;
            const height = rank === 1 ? 'h-32' : rank === 2 ? 'h-24' : 'h-20';
            const color = rank === 1 ? 'bg-paper-yellow' : rank === 2 ? 'bg-gray-300' : 'bg-orange-300';
            const order = rank === 1 ? 'order-2' : rank === 2 ? 'order-1' : 'order-3';
            return (
              <div key={s.name} className={`flex flex-col items-center group ${order}`}>
                <div className="w-12 h-12 bg-white flex items-center justify-center font-bold text-black mb-2 relative z-20 border-2 border-black shadow-[4px_4px_0_0_black]">
                  {s.name.charAt(0)}
                  <span className={`absolute -top-2 -right-2 w-6 h-6 rounded-full ${color} text-black flex items-center justify-center text-xs border-2 border-black`}>{rank}</span>
                </div>
                <div className="text-[10px] font-bold text-white mb-1 max-w-[80px] truncate bg-black px-1">{s.name}</div>
                <div className={`${height} w-16 md:w-24 ${color} border-2 border-black flex items-end justify-center pb-2 relative shadow-[4px_4px_0_0_rgba(0,0,0,0.5)]`}>
                  <span className="font-black text-black text-2xl">{s.total}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white p-6 paper-card mb-8">
        <div className="flex items-center gap-3 mb-6 border-b-2 border-black pb-2">
          <div className="w-10 h-10 bg-paper-blue text-white flex items-center justify-center border-2 border-black"><BarChart2 size={20} /></div>
          <h3 className="font-bold text-black text-sm">مقارنة الأداء العام</h3>
        </div>
        <div className="relative w-full h-64 bg-white border-2 border-black p-4 mb-6">
          <Bar data={chartData} options={chartOptions} />
        </div>
        <div className="overflow-hidden border-2 border-black">
          <table className="w-full text-xs text-center">
            <thead className="bg-black text-white font-bold">
              <tr>
                <th className="p-3 border-r-2 border-white">الصف</th>
                <th className="p-3 border-r-2 border-white">المتوسط</th>
                <th className="p-3">التميز</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-black bg-white">
              {gradeStats.map(g => (
                <tr key={g.grade} className="hover:bg-gray-100">
                  <td className="p-3 font-bold text-black border-r-2 border-black">{g.grade}</td>
                  <td className="p-3 font-bold text-blue-700 border-r-2 border-black">{g.avg.toFixed(1)}</td>
                  <td className="p-3 font-bold text-green-700">{Math.round(g.exc)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 paper-card flex flex-col h-[450px]">
          <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-2">
            <h3 className="font-bold text-black flex items-center gap-2">
              <span className="w-8 h-8 bg-paper-yellow flex items-center justify-center text-black text-xs border-2 border-black"><Star size={14} /></span>
              سجل التميز
            </h3>
            <span className="text-[10px] bg-paper-yellow text-black font-bold px-3 py-1 border-2 border-black">{allExcellent.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
            {allExcellent.length > 0 ? allExcellent.map(s => (
              <div key={s.name} className="flex items-center justify-between p-3 bg-brand-100/50 border-2 border-black mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white flex items-center justify-center font-bold text-xs border-2 border-black shadow-[2px_2px_0_0_black]">{s.name.charAt(0)}</div>
                  <div><div className="text-xs font-bold text-black max-w-[120px] truncate">{s.name}</div><div className="text-[9px] text-gray-600 font-bold">{s.grade}</div></div>
                </div>
                <div className="font-black text-black text-sm">{s.total}</div>
              </div>
            )) : <div className="text-center text-xs text-gray-500 p-4">لا يوجد طلاب</div>}
          </div>
        </div>

        <div className="bg-white p-6 paper-card flex flex-col h-[450px]">
          <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-2">
            <h3 className="font-bold text-black flex items-center gap-2">
              <span className="w-8 h-8 bg-paper-red flex items-center justify-center text-white text-xs border-2 border-black"><AlertTriangle size={14} /></span>
              الفاقد المهاري
            </h3>
            <span className="text-[10px] bg-paper-red text-white font-bold px-3 py-1 border-2 border-black">{allWeak.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
            {allWeak.length > 0 ? allWeak.map(s => (
              <div key={s.name} className="flex items-center justify-between p-3 bg-red-50 border-2 border-black mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white flex items-center justify-center font-bold text-xs border-2 border-black shadow-[2px_2px_0_0_black] text-red-600">!</div>
                  <div><div className="text-xs font-bold text-black max-w-[120px] truncate">{s.name}</div><div className="text-[9px] text-gray-600 font-bold">{s.grade}</div></div>
                </div>
                <div className="font-black text-red-600 text-sm">{s.total}</div>
              </div>
            )) : <div className="text-center text-xs text-gray-500 p-4">لا يوجد طلاب</div>}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 paper-card">
        <h3 className="font-black text-black text-sm mb-4 border-b-2 border-black pb-2">ملخص الفاقد المهاري (أعداد)</h3>
        <div className="overflow-hidden border-2 border-black">
          <table className="w-full text-xs text-center">
            <thead className="bg-paper-red text-white font-bold">
              <tr>
                <th className="p-3 text-right border-r-2 border-black">الصف الدراسي</th>
                <th className="p-3 border-r-2 border-black">ضعف عام</th>
                <th className="p-3 border-r-2 border-black">ضعف اختبارات</th>
                <th className="p-3">ضعف مهام</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-black bg-white">
              {gradeStats.map(g => (
                <tr key={g.grade} className="hover:bg-red-50">
                  <td className="p-3 font-bold text-black border-r-2 border-black text-right">{g.grade}</td>
                  <td className="p-3 font-bold text-red-700 border-r-2 border-black">{g.weakTotal} <span className="text-[9px] text-black font-normal">طالب</span></td>
                  <td className="p-3 text-orange-700 border-r-2 border-black">{g.weakTest}</td>
                  <td className="p-3 text-yellow-700">{g.weakTask}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

