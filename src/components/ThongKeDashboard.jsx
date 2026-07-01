import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { toast } from 'react-hot-toast';

export default function ThongKeDashboard() {
  const today = new Date();
  const tzOffset = today.getTimezoneOffset() * 60000;
  const todayStr = new Date(today.getTime() - tzOffset).toISOString().split('T')[0];
  
  const [tuNgay, setTuNgay] = useState(() => localStorage.getItem('evn_tk_tu_ngay') || todayStr);
  const [denNgay, setDenNgay] = useState(() => localStorage.getItem('evn_tk_den_ngay') || todayStr);
  const [loading, setLoading] = useState(false);
  
  // ================= CÁC MẢNG DỮ LIỆU ĐỂ ĐỔ VÀO POPUP TRA CỨU NHANH =================
  const [listTroNgai, setListTroNgai] = useState([]);
  const [listXacMinh, setListXacMinh] = useState([]);
  const [listChoCat, setListChoCat] = useState([]); // THÊM MỚI: Chờ cắt điện
  const [listDaCat, setListDaCat] = useState([]); // Tổng cắt
  const [listCatNoCuoc, setListCatNoCuoc] = useState([]); // Cắt do nợ
  const [listCatViPham, setListCatViPham] = useState([]); // Cắt do vi phạm
  const [listCatYeuCau, setListCatYeuCau] = useState([]); // Cắt do yêu cầu
  const [listNoDinhKy, setListNoDinhKy] = useState([]);
  const [listNhiemVuKep, setListNhiemVuKep] = useState([]);
  
  // DỮ LIỆU THỐNG KÊ CHI TIẾT
  const [dsNangSuat, setDsNangSuat] = useState([]);
  const [detailModal, setDetailModal] = useState({ isOpen: false, title: '', type: '', data: [] });

  const fetchThongKe = async () => {
    setLoading(true);
    try {
      // 1. TẢI TOÀN BỘ HỒ SƠ ĐỂ XEM BỨC TRANH LƯỚI ĐIỆN HIỆN TẠI (LIVE SNAPSHOT)
      const { data: customersData, error: cError } = await supabase.from('customers').select('*');
      if (cError) throw cError;
      const allKh = customersData || [];

      // BÓC TÁCH KHỐI 1 & 3: ĐIỂM NGHẼN & KỸ THUẬT
      setListTroNgai(allKh.filter(c => c.trang_thai === 'tro_ngai'));
      setListXacMinh(allKh.filter(c => c.trang_thai === 'cho_xac_minh'));
      setListChoCat(allKh.filter(c => c.trang_thai === 'cho_cat_dien')); // THÊM MỚI: Tách ca chờ cắt
      setListNoDinhKy(allKh.filter(c => c.chua_thay_dinh_ky === true));

      // BÓC TÁCH KHỐI 2: PHÂN TÍCH NGƯNG HƠI ĐỂ CLICK ĐƯỢC
      const daCat = allKh.filter(c => c.trang_thai === 'da_cat');
      setListDaCat(daCat);
      setListCatNoCuoc(daCat.filter(c => c.ly_do_ngung === 'no_cuoc'));
      setListCatViPham(daCat.filter(c => c.ly_do_ngung === 'bat_thuong'));
      setListCatYeuCau(daCat.filter(c => c.ly_do_ngung === 'kh_yeu_cau'));
      
      // BÓC TÁCH NHIỆM VỤ KÉP (Vừa mất điện + Vừa nợ định kỳ)
      setListNhiemVuKep(daCat.filter(c => c.chua_thay_dinh_ky === true));

      // 2. TẢI NHẬT KÝ ĐỂ ĐO LƯỜNG NĂNG SUẤT THỢ TRONG KHOẢNG THỜI GIAN ĐÃ CHỌN
      const startDateTime = `${tuNgay}T00:00:00.000Z`;
      const endDateTime = `${denNgay}T23:59:59.999Z`;

      const { data: logsData, error: logsError } = await supabase
        .from('suspension_logs')
        .select('hanh_dong, noi_dung')
        .gte('created_at', startDateTime)
        .lte('created_at', endDateTime);

      if (logsError) throw logsError;

      const nangSuatMap = {};
      (logsData || []).forEach(log => {
        const hanhDong = log.hanh_dong || '';
        const noiDung = log.noi_dung || '';

        // Thuật toán gắp tên nhân viên từ Log (Bảo toàn tương thích với dữ liệu cũ)
        let nhanVien = 'Khác (VP/Hệ thống)';
        const nameMatch = noiDung.match(/(?:\(Bởi:?\s*|-\s*Lập bởi\s*)([^)\n]+)/);
        if (nameMatch && nameMatch[1]) nhanVien = nameMatch[1].trim();

        if (!nangSuatMap[nhanVien]) {
          nangSuatMap[nhanVien] = { ten: nhanVien, caCat: 0, caDong: 0, thayDK: 0 };
        }
        
        // Đếm KPI hiện trường thuần túy
        if (hanhDong === 'Ngưng hơi' || hanhDong === 'Xác nhận Cắt điện') nangSuatMap[nhanVien].caCat++;
        if (hanhDong === 'Đóng điện') nangSuatMap[nhanVien].caDong++;
        if (hanhDong === 'Thay điện kế') nangSuatMap[nhanVien].thayDK++;
      });

      // Xếp hạng: Ưu tiên người làm nhiều thao tác vật lý nhất
      const arrNangSuat = Object.values(nangSuatMap)
        .filter(nv => nv.caCat > 0 || nv.caDong > 0 || nv.thayDK > 0)
        .sort((a, b) => (b.caCat + b.caDong + b.thayDK) - (a.caCat + a.caDong + a.thayDK));
      
      setDsNangSuat(arrNangSuat);

    } catch (error) {
      toast.error('Lỗi tải dữ liệu thống kê');
    } finally {
      setLoading(false);
    }
  };

  const handleJumpToProcess = (customerId) => {
    localStorage.setItem('evn_jump_to_customer', customerId);
    window.dispatchEvent(new Event('evn_trigger_jump'));
    setDetailModal({ ...detailModal, isOpen: false });
    
    // Tự động kích hoạt bấm nút chuyển Tab Điều Hành
    const btnDieuHanh = document.getElementById('btn-tab-dieu-hanh');
    if (btnDieuHanh) btnDieuHanh.click();
    else toast.success('Đã nạp hồ sơ! Hãy bấm sang Tab ĐIỀU HÀNH để xem.');
  };

  useEffect(() => {
    if (tuNgay) localStorage.setItem('evn_tk_tu_ngay', tuNgay);
    if (denNgay) localStorage.setItem('evn_tk_den_ngay', denNgay);
    if (tuNgay && denNgay) fetchThongKe();
  }, [tuNgay, denNgay]);

  return (
    <div className="w-full max-w-md mx-auto p-3 space-y-4 pb-24 fade-in">
      
      {/* KHỐI 1: BỘ LỌC THỜI GIAN */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-3 uppercase flex items-center gap-2">
          <i className="fa-regular fa-calendar-days text-blue-600"></i> Bộ Lọc Thời Gian
        </h3>
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Từ ngày</label>
            <input type="date" value={tuNgay} onChange={(e) => setTuNgay(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 font-medium text-slate-700"/>
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Đến ngày</label>
            <input type="date" value={denNgay} onChange={(e) => setDenNgay(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 font-medium text-slate-700"/>
          </div>
          <div className="pt-5">
            <button onClick={fetchThongKe} disabled={loading} className="bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-bold hover:bg-blue-100 transition-colors border border-blue-200 shadow-sm disabled:opacity-50">
              <i className={`fa-solid fa-rotate ${loading ? 'animate-spin' : ''}`}></i>
            </button>
          </div>
        </div>
      </div>

      {/* KHỐI 2: ĐIỂM NGHẼN VẬN HÀNH (URGENT BOTTLENECKS) - ÉP 3 CỘT NGANG RÚT GỌN */}
      <div className="grid grid-cols-3 gap-2">
        
        {/* Ô 1: Trở Ngại (Đỏ) */}
        <div onClick={() => setDetailModal({ isOpen: true, type: 'trongai', title: 'Cần gỡ vướng Trở Ngại', data: listTroNgai })} className="cursor-pointer bg-red-50 p-2.5 rounded-xl border border-red-200 shadow-sm flex flex-col items-center justify-center text-center active:scale-95 transition-transform hover:ring-2 hover:ring-red-300">
          <div className="flex items-center gap-1.5 mb-0.5">
            <i className="fa-solid fa-triangle-exclamation text-red-500 text-sm"></i>
            <span className="text-xl font-black text-red-700 leading-none">{listTroNgai.length}</span>
          </div>
          <div className="text-[9px] font-bold text-red-600 uppercase tracking-tight">Trở Ngại</div>
        </div>

        {/* Ô 2: Duyệt Bill (Vàng Amber) */}
        <div onClick={() => setDetailModal({ isOpen: true, type: 'xacminh', title: 'Chờ VP Xác Minh Bill', data: listXacMinh })} className="cursor-pointer bg-amber-50 p-2.5 rounded-xl border border-amber-200 shadow-sm flex flex-col items-center justify-center text-center active:scale-95 transition-transform hover:ring-2 hover:ring-amber-300">
          <div className="flex items-center gap-1.5 mb-0.5">
            <i className="fa-solid fa-hourglass-half text-amber-500 text-sm"></i>
            <span className="text-xl font-black text-amber-700 leading-none">{listXacMinh.length}</span>
          </div>
          <div className="text-[9px] font-bold text-amber-600 uppercase tracking-tight">Duyệt Bill</div>
        </div>

        {/* Ô 3: Chờ Cắt (Cam) */}
        <div onClick={() => setDetailModal({ isOpen: true, type: 'chocat', title: 'Chờ VP Xác Nhận Cắt', data: listChoCat })} className="cursor-pointer bg-orange-50 p-2.5 rounded-xl border border-orange-200 shadow-sm flex flex-col items-center justify-center text-center active:scale-95 transition-transform hover:ring-2 hover:ring-orange-300">
          <div className="flex items-center gap-1.5 mb-0.5">
            <i className="fa-solid fa-power-off text-orange-500 text-sm"></i>
            <span className="text-xl font-black text-orange-700 leading-none">{listChoCat.length}</span>
          </div>
          <div className="text-[9px] font-bold text-orange-600 uppercase tracking-tight">Chờ Cắt</div>
        </div>

      </div>

      {/* KHỐI 3: PHÂN TÍCH LƯỚI ĐIỆN & KỸ THUẬT */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center cursor-pointer hover:bg-slate-100" onClick={() => setDetailModal({ isOpen: true, type: 'cat', title: 'Tổng Ca Đang Ngưng Hơi', data: listDaCat })}>
          <h3 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
            <i className="fa-solid fa-satellite-dish text-blue-600"></i> Trạng Thái Lưới Điện
          </h3>
          <span className="bg-slate-800 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow-sm">{listDaCat.length} Đang Cắt</span>
        </div>
        
        {/* === ĐÃ CẬP NHẬT MÀU PASTEL VÀ SỰ KIỆN CLICK CHO 3 Ô NÀY === */}
        <div className="p-3 grid grid-cols-3 gap-2 border-b border-slate-100 bg-white">
          <div onClick={() => setDetailModal({ isOpen: true, type: 'catNoCuoc', title: 'Đang Cắt Do Nợ Cước', data: listCatNoCuoc })} className="text-center p-2 rounded-lg border border-blue-200 bg-blue-50 cursor-pointer active:scale-95 hover:ring-2 hover:ring-blue-300 transition-all">
            <div className="text-lg font-black text-blue-700">{listCatNoCuoc.length}</div>
            <div className="text-[8px] font-bold text-blue-600 uppercase tracking-wider mt-0.5">Do Nợ Cước</div>
          </div>
          
          <div onClick={() => setDetailModal({ isOpen: true, type: 'catYeuCau', title: 'Đang Cắt Theo Yêu Cầu', data: listCatYeuCau })} className="text-center p-2 rounded-lg border border-indigo-200 bg-indigo-50 cursor-pointer active:scale-95 hover:ring-2 hover:ring-indigo-300 transition-all">
            <div className="text-lg font-black text-indigo-700">{listCatYeuCau.length}</div>
            <div className="text-[8px] font-bold text-indigo-600 uppercase tracking-wider mt-0.5">KH Yêu Cầu</div>
          </div>
          
          <div onClick={() => setDetailModal({ isOpen: true, type: 'catViPham', title: 'Đang Cắt Do Vi Phạm', data: listCatViPham })} className="text-center p-2 rounded-lg border border-rose-200 bg-rose-50 cursor-pointer active:scale-95 hover:ring-2 hover:ring-rose-300 transition-all">
            <div className="text-lg font-black text-rose-700">{listCatViPham.length}</div>
            <div className="text-[8px] font-bold text-rose-600 uppercase tracking-wider mt-0.5">Vi Phạm</div>
          </div>
        </div>

        <div className="p-3 bg-white flex gap-3">
          <div onClick={() => setDetailModal({ isOpen: true, type: 'dienke', title: 'Danh Sách Nợ Thay ĐK', data: listNoDinhKy })} className="flex-1 border border-teal-200 bg-teal-50 rounded-lg p-2.5 flex items-center justify-between cursor-pointer active:scale-95 transition-transform hover:ring-2 hover:ring-teal-300">
            <div>
              <div className="text-[9px] font-bold text-teal-600 uppercase">Tồn Thay ĐK</div>
              <div className="text-xl font-black text-teal-700">{listNoDinhKy.length} <span className="text-[10px] font-medium text-teal-600">công tơ</span></div>
            </div>
            <i className="fa-solid fa-screwdriver-wrench text-teal-400 text-2xl opacity-50"></i>
          </div>
          
          <div onClick={() => setDetailModal({ isOpen: true, type: 'nhiemvukep', title: 'Cắt Điện & Nợ Định Kỳ', data: listNhiemVuKep })} className="flex-1 border border-orange-200 bg-orange-50 rounded-lg p-2.5 flex items-center justify-between cursor-pointer active:scale-95 transition-transform hover:ring-2 hover:ring-orange-300">
            <div>
              <div className="text-[9px] font-bold text-orange-600 uppercase">Nhiệm vụ kép</div>
              <div className="text-xl font-black text-orange-700">{listNhiemVuKep.length} <span className="text-[10px] font-medium text-orange-600">ca</span></div>
            </div>
            <i className="fa-solid fa-triangle-exclamation text-orange-400 text-2xl opacity-50 animate-pulse"></i>
          </div>
        </div>
      </div>

      {/* KHỐI 4: BẢNG NĂNG SUẤT THỰC THI HIỆN TRƯỜNG */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
            <i className="fa-solid fa-person-digging text-emerald-600"></i> Khối lượng thực thi
          </h3>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
              <tr>
                <th className="px-3 py-3">Nhân Viên</th>
                <th className="px-2 py-3 text-center text-red-600"><i className="fa-solid fa-scissors"></i> Cắt</th>
                <th className="px-2 py-3 text-center text-emerald-600"><i className="fa-solid fa-bolt"></i> Đóng</th>
                <th className="px-3 py-3 text-center text-teal-600"><i className="fa-solid fa-screwdriver-wrench"></i> Thay ĐK</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dsNangSuat.length > 0 ? dsNangSuat.map((nv, index) => (
                <tr key={index} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-3 font-bold text-slate-700 max-w-[140px] truncate">{nv.ten}</td>
                  <td className="px-2 py-3 text-center font-semibold text-slate-600">{nv.caCat}</td>
                  <td className="px-2 py-3 text-center font-semibold text-slate-600">{nv.caDong}</td>
                  <td className="px-3 py-3 text-center font-semibold text-slate-600">{nv.thayDK}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-slate-400 text-xs italic">
                    <i className="fa-solid fa-box-open text-2xl mb-2 block opacity-50"></i>
                    Không có log thao tác trong thời gian này
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* POPUP DRILL-DOWN HIỂN THỊ DANH SÁCH CHI TIẾT */}
      {detailModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-3 fade-in backdrop-blur-sm">
          <div className="bg-slate-100 rounded-xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className={`p-3.5 flex justify-between items-center shrink-0 text-white shadow-sm ${
              detailModal.type === 'cat' ? 'bg-slate-700' : 
              detailModal.type === 'catNoCuoc' ? 'bg-blue-600' :
              detailModal.type === 'catYeuCau' ? 'bg-indigo-500' :
              detailModal.type === 'catViPham' ? 'bg-rose-600' :
              detailModal.type === 'trongai' ? 'bg-red-600' : 
              detailModal.type === 'xacminh' ? 'bg-amber-600' : 
              detailModal.type === 'chocat' ? 'bg-orange-500' : 
              detailModal.type === 'nhiemvukep' ? 'bg-orange-600' : 'bg-teal-600'
            }`}>
              <h3 className="font-bold text-[11px] uppercase tracking-wider flex items-center gap-2">
                <i className={`fa-solid ${
                  detailModal.type === 'chocat' ? 'fa-power-off' :
                  detailModal.type.includes('cat') ? 'fa-satellite-dish' : 
                  detailModal.type === 'trongai' ? 'fa-triangle-exclamation' : 
                  detailModal.type === 'xacminh' ? 'fa-hourglass-half' : 'fa-screwdriver-wrench'
                }`}></i>
                {detailModal.title} ({detailModal.data.length})
              </h3>
              <button onClick={() => setDetailModal({ ...detailModal, isOpen: false })} className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 w-6 h-6 rounded-full flex items-center justify-center transition-colors"><i className="fa-solid fa-xmark"></i></button>
            </div>
            
            <div className="p-2 overflow-y-auto space-y-1.5 no-scrollbar flex-1 bg-slate-50">
              {detailModal.data.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-12 italic">Không có hồ sơ trong danh mục này.</p>
              ) : (
                detailModal.data.map((item, idx) => (
                  <div key={idx} onClick={() => handleJumpToProcess(item.id)} className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 cursor-pointer hover:border-blue-400 hover:shadow active:scale-[0.99] transition-all relative overflow-hidden flex flex-col justify-center">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                      detailModal.type === 'cat' ? 'bg-slate-500' : 
                      detailModal.type === 'catNoCuoc' ? 'bg-blue-500' : 
                      detailModal.type === 'catYeuCau' ? 'bg-indigo-400' : 
                      detailModal.type === 'catViPham' ? 'bg-rose-500' : 
                      detailModal.type === 'trongai' ? 'bg-red-500' : 
                      detailModal.type === 'xacminh' ? 'bg-amber-500' : 
                      detailModal.type === 'chocat' ? 'bg-orange-400' : 
                      detailModal.type === 'nhiemvukep' ? 'bg-orange-500' : 'bg-teal-500'
                    }`}></div>
                    <div className="pl-2">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="font-mono font-bold text-[10px] text-blue-700 bg-blue-50 border border-blue-100 px-1 rounded">{item.ma_pe || 'TRỐNG MA'}</span>
                        <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1 rounded border border-slate-200">{item.ly_do_ngung === 'no_cuoc' ? 'Nợ cước' : item.ly_do_ngung === 'bat_thuong' ? 'Vi phạm' : 'KH yêu cầu'}</span>
                      </div>
                      <h4 className="font-bold text-xs text-slate-800 truncate">{item.ten_kh || 'Chưa rõ tên'}</h4>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5"><i className="fa-solid fa-location-dot text-slate-300 mr-1"></i>{item.dia_chi || 'Không có địa chỉ'}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="bg-white p-2 text-center border-t border-slate-200 shrink-0">
               <p className="text-[9px] text-slate-500 font-bold"><i className="fa-solid fa-hand-pointer text-blue-500 mr-1 animate-bounce"></i>Bấm vào một dòng để chuyển sang Bảng Điều Hành</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
