import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { toast } from 'react-hot-toast';

export default function GiaoDienTho({ session, profile }) {
  // Thay thế trạng thái giả lập bằng dữ liệu thực từ props truyền vào
  const thoHienTai = profile?.ho_ten || 'Nhân viên';
  
  const [dsCa, setDsCa] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('chua_lam'); // State mới: Quản lý Tab hiển thị

  const fetchData = async () => {
    if (!profile?.id) return; // Kiểm tra chuẩn UUID
    setLoading(true);
    try {
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);

      // SỰ THAY ĐỔI LỚN 1: Bỏ bộ lọc 'trang_thai_hien_tai' ở câu lệnh SQL.
      // Chúng ta sẽ lấy TẤT CẢ các ca của thợ này trong hôm nay, sau đó dùng Javascript để chia vào 2 Tab (Chưa làm / Đã xong).
      const { data, error } = await supabase
        .from('danh_sach_doc_thu')
        .select('*')
        .eq('is_active', true)
        .eq('tho_id', profile.id) // TRUY XUẤT BẰNG UUID
        .gte('ngay_nap_du_lieu', todayMidnight.toISOString());
      
      if (error) throw error;
      setDsCa(data || []); 
      
    } catch (error) {
      console.error("Chi tiết lỗi Supabase:", error);
      toast.error(`Lỗi DB: ${error.message}`); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [profile?.id]);

  // ==========================================
  // SỰ THAY ĐỔI LỚN 2: PHÂN LOẠI GIỎ VIỆC THEO TAB
  // ==========================================
  const cacTrangThaiChuaLam = ['chua_xu_ly', 'hen_lai'];
  
  // Tách làm 2 rổ dữ liệu
  const dsChuaLam = dsCa.filter(c => cacTrangThaiChuaLam.includes(c.trang_thai_hien_tai));
  const dsDaXong = dsCa.filter(c => !cacTrangThaiChuaLam.includes(c.trang_thai_hien_tai));

  // Xác định dữ liệu hiển thị lên màn hình dựa vào Tab đang chọn
  const dsHienThi = activeTab === 'chua_lam' ? dsChuaLam : dsDaXong;

  // ==========================================
  // HÀM XỬ LÝ KỊCH BẢN (GIỮ NGUYÊN 100% CỦA BẠN)
  // ==========================================
  const handleXuLyKichBan = async (ca, kichBan, trangThaiMoi) => {
    let ghiChu = '';
    
    if (kichBan === 'HẸN LẠI') {
      ghiChu = prompt('Nhập thời gian/lý do khách hẹn lại (VD: 17h chiều mai đóng):');
      if (ghiChu === null) return; 
    }

    const toastId = toast.loading(`Đang xử lý kịch bản: ${kichBan}...`);
    try {
      if (trangThaiMoi !== 'da_thu') {
        const { data: checkKhList } = await supabase.from('customers').select('id, trang_thai').eq('ma_pe', ca.ma_pe).limit(1);
        const checkKh = checkKhList && checkKhList.length > 0 ? checkKhList[0] : null;
        
        const blockStatuses = ['cho_xac_minh', 'cho_cat_dien', 'da_cat'];
        
        if (checkKh && blockStatuses.includes(checkKh.trang_thai)) {
          await supabase.from('danh_sach_doc_thu')
            .update({ trang_thai_hien_tai: 'loi_dong_bo_kd' }) 
            .eq('id', ca.id);
            
          toast('⚠️ Đã có lệnh bên Điều Hành. Hệ thống tự động thu hồi ca!', { id: toastId, style: { background: '#fff3cd', color: '#856404', border: '1px solid #ffeeba' } });
          fetchData();
          return; 
        }
      }

      await supabase.from('danh_sach_doc_thu')
        .update({ trang_thai_hien_tai: trangThaiMoi })
        .eq('id', ca.id);
      
      await supabase.from('nhat_ky_doc_thu').insert([{
        doc_thu_id: ca.id,
        ma_pe: ca.ma_pe,
        ky_hoa_don: ca.ky_hoa_don,
        nguoi_thao_tac: thoHienTai,
        kich_ban_xu_ly: kichBan,
        ghi_chu: ghiChu
      }]);

      if (trangThaiMoi === 'da_chuyen_xac_minh' || trangThaiMoi === 'da_chuyen_cat_dien') {
        const trangThaiDich = trangThaiMoi === 'da_chuyen_xac_minh' ? 'cho_xac_minh' : 'da_cat';

        const payloadCustomer = {
          ma_pe: ca.ma_pe,
          ten_kh: ca.ten_kh,
          dia_chi: ca.dia_chi,
          so_dien_thoai: ca.so_dien_thoai || '',
          so_tien_no: ca.so_tien || 0,
          ly_do_ngung: 'no_cuoc',
          trang_thai: trangThaiDich,
          ghi_chu: `(Chuyển tự động từ Đốc Thu bởi ${thoHienTai})`
        };

        if (trangThaiDich === 'da_cat') payloadCustomer.ngay_cat = new Date().toISOString();

        let newCustomerId = null;

        if (checkKh) {
          await supabase.from('customers').update(payloadCustomer).eq('id', checkKh.id);
          newCustomerId = checkKh.id;
        } else {
          const { data: newKh } = await supabase.from('customers').insert([payloadCustomer]).select();
          if (newKh && newKh.length > 0) newCustomerId = newKh[0].id;
        }

        if (newCustomerId) {
          await supabase.from('suspension_logs').insert([{
            customer_id: newCustomerId,
            hanh_dong: 'Chuyển lệnh tự động',
            noi_dung: `Đội Đốc Thu (${thoHienTai}) báo về: Khách ${kichBan}. Yêu cầu văn phòng theo dõi xử lý tiếp!`
          }]);
        }
      }

      toast.success(`Đã hoàn tất: ${kichBan}`, { id: toastId });
      fetchData(); 
    } catch (error) {
      toast.error('Có lỗi hệ thống!', { id: toastId });
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-slate-50 min-h-screen pb-24 flex flex-col fade-in">
      
      {/* THANH TOPBAR THỢ ĐƯỢC THIẾT KẾ LẠI */}
      <div className="bg-blue-700 px-4 py-3 sticky top-0 z-20 shadow-md flex justify-between items-center text-white">
        <div>
          <h2 className="font-black text-lg tracking-tight"><i className="fa-solid fa-helmet-safety mr-2 text-yellow-400"></i>ĐI TUYẾN</h2>
          <p className="text-[10px] font-medium opacity-80 mt-0.5">Xin chào, {thoHienTai}</p>
        </div>
        
        <button onClick={fetchData} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 active:scale-95 transition-all">
          <i className={`fa-solid fa-rotate ${loading ? 'animate-spin' : ''}`}></i>
        </button>
      </div>

      <div className="p-3">
        
        {/* SỰ THAY ĐỔI LỚN 3: THANH CHUYỂN TAB ĐƯỢC CHÈN VÀO GIAO DIỆN */}
        <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1.5 mb-4 sticky top-[72px] z-10">
          <button 
            onClick={() => setActiveTab('chua_lam')} 
            className={`flex-1 py-3 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeTab === 'chua_lam' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <i className="fa-solid fa-list-check"></i> CHƯA XỬ LÝ ({dsChuaLam.length})
          </button>
          <button 
            onClick={() => setActiveTab('da_xong')} 
            className={`flex-1 py-3 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeTab === 'da_xong' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <i className="fa-solid fa-check-double"></i> ĐÃ HOÀN THÀNH ({dsDaXong.length})
          </button>
        </div>

        {dsHienThi.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 mt-10">
             <i className="fa-solid fa-champagne-glasses text-4xl mb-3 text-emerald-400"></i>
             <p className="text-sm font-bold uppercase">Giỏ việc đang trống!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dsHienThi.map(ca => (
              <div key={ca.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden slide-up">
                
                {/* Đánh dấu ca HẸN LẠI */}
                {ca.trang_thai_hien_tai === 'hen_lai' && activeTab === 'chua_lam' && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-orange-400"></div>
                )}

                {/* Thanh trạng thái nhỏ trên đầu cho các ca Đã Xong */}
                {activeTab === 'da_xong' && (
                  <div className={`absolute top-0 left-0 right-0 py-1 text-center text-[10px] font-black uppercase text-white ${
                    ca.trang_thai_hien_tai === 'da_thu' ? 'bg-emerald-500' :
                    ca.trang_thai_hien_tai === 'da_chuyen_cat_dien' ? 'bg-red-500' :
                    ca.trang_thai_hien_tai === 'da_chuyen_xac_minh' ? 'bg-amber-500' : 'bg-orange-500'
                  }`}>
                    {ca.trang_thai_hien_tai === 'da_thu' ? 'Đã thu tiền' :
                     ca.trang_thai_hien_tai === 'da_chuyen_cat_dien' ? 'Đã báo Cắt Điện' :
                     ca.trang_thai_hien_tai === 'da_chuyen_xac_minh' ? 'Khách CK (Chờ VP xác minh)' : 'Đã báo hẹn lại'}
                  </div>
                )}
                
                <div className={`flex justify-between items-start mb-2 pl-2 ${activeTab === 'da_xong' ? 'mt-4' : ''}`}>
                  <span className="font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{ca.ma_pe}</span>
                  <span className="font-bold text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded"><i className="fa-solid fa-location-dot mr-1"></i>{ca.ma_tru_sach}</span>
                </div>
                
                <h4 className="font-bold text-slate-800 text-sm pl-2">{ca.ten_kh}</h4>
                <div className="flex justify-between mt-1 mb-3 pl-2">
                  <span className="text-xs font-medium text-emerald-600"><i className="fa-solid fa-phone mr-1"></i>{ca.so_dien_thoai || 'Trống'}</span>
                  <span className="text-xs font-black text-red-500">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(ca.so_tien || 0)}</span>
                </div>

                {/* 4 NÚT KỊCH BẢN CHỈ HIỆN KHI Ở TAB "CHƯA XỬ LÝ" */}
                {activeTab === 'chua_lam' && (
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
                      onClick={() => handleXuLyKichBan(ca, 'HẸN LẠI', 'da_bao_hen')} 
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
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}