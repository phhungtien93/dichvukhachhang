import { useState, useEffect } from 'react';
import QuanLyDanhSach from './components/QuanLyDanhSach';
import ThongKeDashboard from './components/ThongKeDashboard';
import PhanCongDashboard from './components/PhanCongDashboard';
import { Toaster } from 'react-hot-toast';
import { supabase } from './supabase'; // Bổ sung thư viện kết nối

function App() {
  const [activeTab, setActiveTab] = useState('danhsach');
  const [session, setSession] = useState(null); // Thêm biến theo dõi đăng nhập

  // Kích hoạt radar lắng nghe trạng thái đăng nhập từ Supabase
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
      
      {/* NỘI DUNG CHÍNH */}
      <div className="flex-1 overflow-y-auto pb-28 w-full h-full">
        {activeTab === 'danhsach' && <QuanLyDanhSach />}
        {activeTab === 'thongke' && <ThongKeDashboard />}
      </div>

      {/* THANH MENU: ĐƯỢC BỌC TRONG {session && ...} ĐỂ CHỈ HIỆN KHI ĐÃ ĐĂNG NHẬP */}
      {session && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-x border-slate-200 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-[60] rounded-t-xl fade-in">
          <div className="flex justify-around items-center h-16">
            
            <button 
              id="btn-tab-dieu-hanh"
              onClick={() => setActiveTab('danhsach')} 
              className={`flex flex-col items-center justify-center w-full h-full transition-colors ${activeTab === 'danhsach' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <i className={`text-xl mb-1 ${activeTab === 'danhsach' ? 'fa-solid fa-clipboard-list' : 'fa-solid fa-list'}`}></i>
              <span className="text-[10px] font-bold uppercase tracking-wide">Điều Hành</span>
            </button>

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
