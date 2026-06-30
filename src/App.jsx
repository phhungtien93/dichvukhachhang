import { useState, useEffect } from 'react';
import QuanLyDanhSach from './components/QuanLyDanhSach';
import ThongKeDashboard from './components/ThongKeDashboard';
import PhanCongDashboard from './components/PhanCongDashboard';
import GiaoDienTho from './components/GiaoDienTho';
import { Toaster } from 'react-hot-toast';
import { supabase } from './supabase'; 

function App() {
  // Thay vì tách 'view', ta gộp tất cả vào activeTab. Mặc định mở Tab Điều Hành.
  const [activeTab, setActiveTab] = useState('danhsach');
  const [session, setSession] = useState(null); 

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      
      {/* KHU VỰC HIỂN THỊ NỘI DUNG CHÍNH DỰA VÀO TAB ĐƯỢC CHỌN */}
      <div className="flex-1 overflow-y-auto pb-28 w-full h-full relative">
        {activeTab === 'phancong' && <PhanCongDashboard session={session} />}
        {activeTab === 'nhanviec' && <GiaoDienTho session={session} />}
        {activeTab === 'danhsach' && <QuanLyDanhSach session={session} />}
        {activeTab === 'thongke' && <ThongKeDashboard session={session} />}
      </div>

      {/* THANH MENU ĐÁY: ĐÃ TÍCH HỢP 4 TAB CHÍNH */}
      {session && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-x border-slate-200 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-[60] rounded-t-xl fade-in">
          <div className="flex justify-around items-center h-16">

            {/* TAB 1: PHÂN CÔNG */}
            <button 
              onClick={() => setActiveTab('phancong')} 
              className={`flex flex-col items-center justify-center w-full h-full transition-colors ${activeTab === 'phancong' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <i className={`text-xl mb-1 ${activeTab === 'phancong' ? 'fa-solid fa-users-gear' : 'fa-solid fa-users'}`}></i>
              <span className="text-[10px] font-bold uppercase tracking-wide">Phân Công</span>
            </button>
            
            {/* TAB 2 (MỚI): NHẬN VIỆC */}
            <button 
              onClick={() => setActiveTab('nhanviec')} 
              className={`flex flex-col items-center justify-center w-full h-full transition-colors ${activeTab === 'nhanviec' ? 'text-amber-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <i className={`text-xl mb-1 ${activeTab === 'nhanviec' ? 'fa-solid fa-helmet-safety' : 'fa-solid fa-hard-hat'}`}></i>
              <span className="text-[10px] font-bold uppercase tracking-wide">Nhận Việc</span>
            </button>

            {/* TAB 3: ĐIỀU HÀNH */}
            <button 
              onClick={() => setActiveTab('danhsach')} 
              className={`flex flex-col items-center justify-center w-full h-full transition-colors ${activeTab === 'danhsach' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <i className={`text-xl mb-1 ${activeTab === 'danhsach' ? 'fa-solid fa-clipboard-list' : 'fa-solid fa-list'}`}></i>
              <span className="text-[10px] font-bold uppercase tracking-wide">Điều Hành</span>
            </button>

            {/* TAB 4: THỐNG KÊ */}
            <button 
              onClick={() => setActiveTab('thongke')} 
              className={`flex flex-col items-center justify-center w-full h-full transition-colors ${activeTab === 'thongke' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <i className={`text-xl mb-1 ${activeTab === 'thongke' ? 'fa-solid fa-chart-pie' : 'fa-solid fa-chart-simple'}`}></i>
              <span className="text-[10px] font-bold uppercase tracking-wide">Thống Kê</span>
            </button>

          </div>
        </div>
      )}

      <Toaster position="top-center" reverseOrder={false} />
    </div>
  );
}

export default App;