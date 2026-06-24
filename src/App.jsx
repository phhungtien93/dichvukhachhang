import { useState } from 'react';
import QuanLyDanhSach from './components/QuanLyDanhSach';
import ThongKeDashboard from './components/ThongKeDashboard';
import { Toaster } from 'react-hot-toast';

function App() {
  const [activeTab, setActiveTab] = useState('danhsach');

  return (
    // Xóa các class ép khung, trả lại màn hình tràn viền 100%
    <div className="h-screen flex flex-col bg-slate-50">
      
      {/* NỘI DUNG CHÍNH: Thả nổi tự nhiên không viền */}
      <div className="flex-1 overflow-y-auto pb-28 w-full h-full">
        {activeTab === 'danhsach' && <QuanLyDanhSach />}
        {activeTab === 'thongke' && <ThongKeDashboard />}
      </div>

      {/* THANH MENU: Bóp lại bằng đúng max-w-md và neo ở chính giữa màn hình */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-x border-slate-200 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-[60] rounded-t-xl">
        <div className="flex justify-around items-center h-16">
          
          {/* NÚT 1: ĐIỀU HÀNH */}
          <button 
            onClick={() => setActiveTab('danhsach')} 
            className={`flex flex-col items-center justify-center w-full h-full transition-colors ${activeTab === 'danhsach' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <i className={`text-xl mb-1 ${activeTab === 'danhsach' ? 'fa-solid fa-clipboard-list' : 'fa-solid fa-list'}`}></i>
            <span className="text-[10px] font-bold uppercase tracking-wide">Điều Hành</span>
          </button>

          {/* NÚT 2: THỐNG KÊ */}
          <button 
            onClick={() => setActiveTab('thongke')} 
            className={`flex flex-col items-center justify-center w-full h-full transition-colors ${activeTab === 'thongke' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <i className={`text-xl mb-1 ${activeTab === 'thongke' ? 'fa-solid fa-chart-pie' : 'fa-solid fa-chart-simple'}`}></i>
            <span className="text-[10px] font-bold uppercase tracking-wide">Thống Kê</span>
          </button>

        </div>
      </div>

      <Toaster position="top-center" reverseOrder={false} />
    </div>
  );
}

export default App;