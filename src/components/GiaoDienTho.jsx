import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { toast } from 'react-hot-toast';

const DANH_SACH_THO = ['Anh A', 'Anh B', 'Anh C', 'Anh D'];

export default function GiaoDienTho() {
  const [thoHienTai, setThoHienTai] = useState(DANH_SACH_THO[0]); // Giả lập đăng nhập
  const [dsCa, setDsCa] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('danh_sach_doc_thu')
        .select('*')
        .eq('nguoi_phu_trach', thoHienTai)
        .in('trang_thai_hien_tai', ['chua_xu_ly', 'hen_lai']); // Chỉ lấy ca còn tồn
      
      if (error) throw error;
      setDsCa(data || []);
    } catch (error) {
      toast.error('Lỗi tải dữ liệu ca!');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [thoHienTai]);

  // HÀM XỬ LÝ 4 KỊCH BẢN
  const handleXuLyKichBan = async (ca, kichBan, trangThaiMoi) => {
    let ghiChu = '';
    
    // Nếu là kịch bản 3 (Khách hẹn), bắt buộc nhập giờ
    if (kichBan === 'HẸN LẠI') {
      ghiChu = prompt('Nhập thời gian/lý do khách hẹn lại (VD: 17h chiều mai đóng):');
      if (ghiChu === null) return; // Bấm Cancel thì hủy thao tác
    }

    const toastId = toast.loading(`Đang xử lý kịch bản: ${kichBan}...`);
    try {
      // 1. Chuyển trạng thái ca ở bảng danh sách gốc
      await supabase.from('danh_sach_doc_thu')
        .update({ trang_thai_hien_tai: trangThaiMoi })
        .eq('id', ca.id);
      
      // 2. Ghi dấu vết vào Hộp đen vĩnh viễn
      await supabase.from('nhat_ky_doc_thu').insert([{
        doc_thu_id: ca.id,
        ma_pe: ca.ma_pe,
        ky_hoa_don: ca.ky_hoa_don,
        nguoi_thao_tac: thoHienTai,
        kich_ban_xu_ly: kichBan,
        ghi_chu: ghiChu
      }]);

      toast.success(`Đã hoàn tất: ${kichBan}`, { id: toastId });
      fetchData(); // Tải lại màn hình để ca đó biến mất (nếu xong) hoặc đổi màu
    } catch (error) {
      toast.error('Có lỗi hệ thống!', { id: toastId });
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-slate-50 min-h-screen pb-6 flex flex-col fade-in">
      {/* THANH TOPBAR THỢ */}
      <div className="bg-blue-700 px-4 py-3 sticky top-0 z-10 shadow-md flex justify-between items-center text-white">
        <div>
          <h2 className="font-black text-lg tracking-tight"><i className="fa-solid fa-helmet-safety mr-2 text-yellow-400"></i>ĐI TUYẾN</h2>
          <p className="text-[10px] font-medium opacity-80">Giao diện Mobile cho nhân viên</p>
        </div>
        
        {/* Nút giả lập chuyển đổi user Thợ */}
        <select 
          value={thoHienTai}
          onChange={(e) => setThoHienTai(e.target.value)}
          className="bg-blue-800 border border-blue-600 text-white text-xs font-bold rounded p-1.5 outline-none"
        >
          {DANH_SACH_THO.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* DANH SÁCH CA CỦA THỢ ĐÓ */}
      <div className="p-3">
        <div className="flex justify-between items-end mb-3">
          <h3 className="text-sm font-bold text-slate-600">
            Giỏ việc của <span className="text-blue-700">{thoHienTai}</span>
          </h3>
          <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full">
            {dsCa.length} Ca tồn
          </span>
        </div>

        {dsCa.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 mt-10">
             <i className="fa-solid fa-champagne-glasses text-4xl mb-3 text-emerald-400"></i>
             <p className="text-sm font-bold uppercase">Tuyệt vời, đã dọn sạch giỏ!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dsCa.map(ca => (
              <div key={ca.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                {/* Đánh dấu ca nào là ca bị HẸN LẠI từ hôm trước */}
                {ca.trang_thai_hien_tai === 'hen_lai' && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-orange-400"></div>
                )}
                
                <div className="flex justify-between items-start mb-2 pl-2">
                  <span className="font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{ca.ma_pe}</span>
                  <span className="font-bold text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded"><i className="fa-solid fa-location-dot mr-1"></i>{ca.ma_tru_sach}</span>
                </div>
                
                <h4 className="font-bold text-slate-800 text-sm pl-2">{ca.ten_kh}</h4>
                <div className="flex justify-between mt-1 mb-3 pl-2">
                  <span className="text-xs font-medium text-emerald-600"><i className="fa-solid fa-phone mr-1"></i>{ca.so_dien_thoai || 'Trống'}</span>
                  <span className="text-xs font-black text-red-500">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(ca.so_tien || 0)}</span>
                </div>

                {/* 4 NÚT KỊCH BẢN - THIẾT KẾ CHO NGÓN TAY CÁI */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100">
                  <button 
                    onClick={() => handleXuLyKichBan(ca, 'KHÔNG ĐÓNG - CẮT ĐIỆN', 'da_chuyen_cat_dien')} 
                    className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-600 hover:text-white active:scale-95 transition-all font-bold py-2.5 rounded-lg text-[11px] shadow-sm flex flex-col items-center justify-center gap-1"
                  >
                    <i className="fa-solid fa-scissors text-sm"></i> CẮT ĐIỆN
                  </button>
                  
                  <button 
                    onClick={() => handleXuLyKichBan(ca, 'ĐƯA BILL - CHỜ XÁC MINH', 'da_chuyen_xac_minh')} 
                    className="bg-yellow-50 text-yellow-700 border border-yellow-300 hover:bg-yellow-500 hover:text-white active:scale-95 transition-all font-bold py-2.5 rounded-lg text-[11px] shadow-sm flex flex-col items-center justify-center gap-1"
                  >
                    <i className="fa-solid fa-receipt text-sm"></i> XÁC MINH
                  </button>
                  
                  <button 
                    onClick={() => handleXuLyKichBan(ca, 'HẸN LẠI', 'hen_lai')} 
                    className="bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-500 hover:text-white active:scale-95 transition-all font-bold py-2.5 rounded-lg text-[11px] shadow-sm flex flex-col items-center justify-center gap-1"
                  >
                    <i className="fa-solid fa-clock-rotate-left text-sm"></i> HẸN LẠI
                  </button>
                  
                  <button 
                    onClick={() => handleXuLyKichBan(ca, 'ĐÃ THU', 'da_thu')} 
                    className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-500 hover:text-white active:scale-95 transition-all font-bold py-2.5 rounded-lg text-[11px] shadow-sm flex flex-col items-center justify-center gap-1"
                  >
                    <i className="fa-solid fa-money-bill-wave text-sm"></i> ĐÃ THU
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
