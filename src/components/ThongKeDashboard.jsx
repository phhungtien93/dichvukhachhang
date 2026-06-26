import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { toast } from 'react-hot-toast';

export default function ThongKeDashboard() {
  // Lấy ngày hiện tại mặc định
  const today = new Date();
  const tzOffset = today.getTimezoneOffset() * 60000;
  const todayStr = new Date(today.getTime() - tzOffset).toISOString().split('T')[0];
  
  // Khởi tạo: Ưu tiên moi trong trí nhớ (localStorage) ra trước, nếu không có mới dùng ngày hiện tại
  const [tuNgay, setTuNgay] = useState(() => localStorage.getItem('evn_tk_tu_ngay') || todayStr);
  const [denNgay, setDenNgay] = useState(() => localStorage.getItem('evn_tk_den_ngay') || todayStr);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  
  // Khai báo các mảng chứa dữ liệu chi tiết cấu thành số liệu
  const [listCaCat, setListCaCat] = useState([]);
  const [listCaDong, setListCaDong] = useState([]);
  const [listCaTroNgai, setListCaTroNgai] = useState([]);
  
  // Trạng thái bật/tắt và dữ liệu hiển thị của Popup
  const [detailModal, setDetailModal] = useState({ isOpen: false, title: '', type: '', data: [] });

  // Hàm kéo dữ liệu từ bảng suspension_logs theo ngày
  const fetchThongKe = async () => {
    setLoading(true);
    try {
      const startDateTime = `${tuNgay}T00:00:00.000Z`;
      const endDateTime = `${denNgay}T23:59:59.999Z`;

      const { data: logsData, error: logsError } = await supabase
        .from('suspension_logs')
        .select('*')
        .gte('created_at', startDateTime)
        .lte('created_at', endDateTime)
        .order('created_at', { ascending: false });

      if (logsError) throw logsError;
      const rawLogs = logsData || [];
      setLogs(rawLogs);

      // Thuật toán gom ID tra cứu thông tin khách hàng từ bảng customers
      const customerIds = [...new Set(rawLogs.map(l => l.customer_id))];
      let customersData = [];
      if (customerIds.length > 0) {
        const { data: cData } = await supabase
          .from('customers')
          .select('id, ma_pe, ten_kh, dia_chi, so_dien_thoai')
          .in('id', customerIds);
        customersData = cData || [];
      }

      const arrCat = []; const arrDong = []; const arrTroNgai = [];
      
      rawLogs.forEach(log => {
        const hanhDong = log.hanh_dong || '';
        const noiDung = log.noi_dung || '';
        
        let nhanVien = 'Không xác định';
        const nameMatch = noiDung.match(/(?:\(Bởi:?\s*|-\s*Lập bởi\s*)([^)\n]+)/);
        if (nameMatch && nameMatch[1]) nhanVien = nameMatch[1].trim();

        const khInfo = customersData.find(c => c.id === log.customer_id) || {};
        const fullItem = { ...log, ...khInfo, nhan_vien: nhanVien };

        if (hanhDong === 'Ngưng hơi' || (hanhDong === 'Tạo/Cập nhật' && noiDung.includes('Đã cắt thực tế'))) arrCat.push(fullItem);
        if (hanhDong === 'Đóng điện') arrDong.push(fullItem);
        if (hanhDong.includes('Báo trở ngại') || (hanhDong === 'Tạo/Cập nhật' && noiDung.includes('Phát hiện bất thường'))) arrTroNgai.push(fullItem);
      });

      setListCaCat(arrCat);
      setListCaDong(arrDong);
      setListCaTroNgai(arrTroNgai);

    } catch (error) {
      toast.error('Lỗi tải dữ liệu thống kê');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Thêm hàm xử lý phát tín hiệu nhảy sang Tab Điều Hành và nạp hồ sơ
  const handleJumpToProcess = (customerId) => {
    localStorage.setItem('evn_jump_to_customer', customerId);
    window.dispatchEvent(new Event('evn_trigger_jump'));
    setDetailModal({ ...detailModal, isOpen: false });
    
    // Tự động kích hoạt bấm nút chuyển Tab Điều Hành trên giao diện chính nếu nút đó có ID
    const btnDieuHanh = document.getElementById('btn-tab-dieu-hanh');
    if (btnDieuHanh) btnDieuHanh.click();
    else toast.success('Đã nạp hồ sơ! Hãy bấm sang Tab ĐIỀU HÀNH để xem.');
  };

  // Tự động chạy lại & Lưu vào trí nhớ trình duyệt khi người dùng đổi ngày
  useEffect(() => {
    // Lưu lại lựa chọn của người dùng vào localStorage
    if (tuNgay) localStorage.setItem('evn_tk_tu_ngay', tuNgay);
    if (denNgay) localStorage.setItem('evn_tk_den_ngay', denNgay);

    if (tuNgay && denNgay) {
      fetchThongKe();
    }
  }, [tuNgay, denNgay]);

  // ================= THUẬT TOÁN BÓC TÁCH DỮ LIỆU THỰC TẾ =================
  
  const tongQuan = { caCat: 0, caDong: 0, caTroNgai: 0, tienThu: 0 };
  const nangSuatMap = {};
  
  logs.forEach(log => {
    // Gọi đúng tên cột trong Supabase
    const hanhDong = log.hanh_dong || '';
    const noiDung = log.noi_dung || '';

    // THUẬT TOÁN TÌM TÊN NHÂN VIÊN: 
    // Quét tìm chữ "(Bởi: Tên)", "(Bởi Tên)" hoặc "- Lập bởi Tên" trong nội dung log
    let nhanVien = 'Không xác định';
    const nameMatch = noiDung.match(/(?:\(Bởi:?\s*|-\s*Lập bởi\s*)([^)\n]+)/);
    if (nameMatch && nameMatch[1]) {
      nhanVien = nameMatch[1].trim();
    }

    if (!nangSuatMap[nhanVien]) {
      nangSuatMap[nhanVien] = { ten: nhanVien, caCat: 0, caDong: 0, caTroNgai: 0, tienThu: 0 };
    }
    
    // 1. Đếm ca CẮT ĐIỆN (Gồm thao tác "Ngưng hơi" và Khởi tạo "Đã cắt thực tế")
    if (hanhDong === 'Ngưng hơi' || (hanhDong === 'Tạo/Cập nhật' && noiDung.includes('Đã cắt thực tế'))) {
      tongQuan.caCat++;
      nangSuatMap[nhanVien].caCat++;
    }
    
    // 2. Đếm ca ĐÓNG ĐIỆN
    if (hanhDong === 'Đóng điện') {
      tongQuan.caDong++;
      nangSuatMap[nhanVien].caDong++;
    }
    
    // 3. Đếm ca TRỞ NGẠI
    if (hanhDong.includes('Báo trở ngại') || (hanhDong === 'Tạo/Cập nhật' && noiDung.includes('Phát hiện bất thường'))) {
      tongQuan.caTroNgai++;
      nangSuatMap[nhanVien].caTroNgai++;
    }
    
    // 4. Cộng dồn TIỀN THU (Từ các lệnh Xác Minh OK hoặc Xóa nợ)
    if (hanhDong === 'Xóa nợ' || hanhDong === 'Xác minh: OK' || hanhDong === 'Tạo/Cập nhật') {
      // Tìm số tiền có định dạng kiểu "200.000đ" hoặc "325 đ"
      const moneyMatch = noiDung.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(?:đ|vnđ|vnd)/i);
      if (moneyMatch && !hanhDong.includes('Tạo/Cập nhật')) { 
         // Chỉ cộng tiền ở các lệnh Thu Tiền / Xác minh, bỏ qua lệnh Khởi tạo
        const tien = parseInt(moneyMatch[1].replace(/[,.]/g, ''), 10);
        if (!isNaN(tien)) {
          tongQuan.tienThu += tien;
          nangSuatMap[nhanVien].tienThu += tien;
        }
      }
    }
  });

  const dsNangSuat = Object.values(nangSuatMap).sort((a, b) => b.caCat - a.caCat); // Xếp người cắt nhiều nhất lên đầu

  // ================= GIAO DIỆN =================
  return (
    <div className="w-full max-w-md mx-auto p-3 space-y-4 pb-24 fade-in">
      
      {/* Khối 1: Bộ Lọc Thời Gian */}
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

      {/* Khối 2: Toàn Cảnh Chiến Dịch (Hỗ trợ Click xem chi tiết) */}
      <div className="grid grid-cols-2 gap-4">
        <div onClick={() => setDetailModal({ isOpen: true, type: 'cat', title: 'Danh Sách Ca Đã Cắt Điện', data: listCaCat })} className="cursor-pointer bg-gradient-to-br from-red-50 to-rose-100 p-4 rounded-xl border border-red-200 shadow-sm flex flex-col items-center justify-center text-center active:scale-95 hover:ring-2 hover:ring-red-300 transition-all">
          <i className="fa-solid fa-scissors text-red-500 text-2xl mb-1"></i>
          <span className="text-3xl font-black text-red-700">{listCaCat.length}</span>
          <span className="text-[10px] font-bold text-red-600 uppercase mt-1">Đã Cắt Điện</span>
        </div>
        
        <div onClick={() => setDetailModal({ isOpen: true, type: 'dong', title: 'Danh Sách Ca Đã Đóng Điện', data: listCaDong })} className="cursor-pointer bg-gradient-to-br from-emerald-50 to-green-100 p-4 rounded-xl border border-emerald-200 shadow-sm flex flex-col items-center justify-center text-center active:scale-95 hover:ring-2 hover:ring-emerald-300 transition-all">
          <i className="fa-solid fa-bolt text-emerald-500 text-2xl mb-1"></i>
          <span className="text-3xl font-black text-emerald-700">{listCaDong.length}</span>
          <span className="text-[10px] font-bold text-emerald-600 uppercase mt-1">Đã Đóng Điện</span>
        </div>

        <div onClick={() => setDetailModal({ isOpen: true, type: 'trongai', title: 'Danh Sách Ca Báo Trở Ngại', data: listCaTroNgai })} className="cursor-pointer bg-gradient-to-br from-purple-50 to-fuchsia-100 p-4 rounded-xl border border-purple-200 shadow-sm flex flex-col items-center justify-center text-center active:scale-95 hover:ring-2 hover:ring-purple-300 transition-all">
          <i className="fa-solid fa-triangle-exclamation text-purple-500 text-2xl mb-1"></i>
          <span className="text-3xl font-black text-purple-700">{listCaTroNgai.length}</span>
          <span className="text-[10px] font-bold text-purple-600 uppercase mt-1">Báo Trở Ngại</span>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-cyan-100 p-4 rounded-xl border border-blue-200 shadow-sm flex flex-col items-center justify-center text-center relative overflow-hidden group">
          <i className="fa-solid fa-sack-dollar text-blue-500 text-2xl mb-1 group-hover:scale-110 transition-transform"></i>
          <span className="text-2xl font-black text-blue-700">{tongQuan.tienThu > 0 ? tongQuan.tienThu.toLocaleString('vi-VN') : '0'}</span>
          <span className="text-[10px] font-bold text-blue-600 uppercase mt-1">Gạch Nợ (VNĐ)</span>
        </div>
      </div>

      {/* Khối 3: Bảng Vàng Năng Suất */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
            <i className="fa-solid fa-medal text-yellow-500"></i> Năng Suất Cá Nhân
          </h3>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
              <tr>
                <th className="px-3 py-3">Nhân Viên</th>
                <th className="px-2 py-3 text-center text-red-600"><i className="fa-solid fa-scissors"></i> Cắt</th>
                <th className="px-2 py-3 text-center text-emerald-600"><i className="fa-solid fa-bolt"></i> Đóng</th>
                <th className="px-2 py-3 text-center text-purple-600"><i className="fa-solid fa-triangle-exclamation"></i> Ngại</th>
                <th className="px-3 py-3 text-right text-blue-600"><i className="fa-solid fa-sack-dollar"></i> Tiền Thu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dsNangSuat.length > 0 ? dsNangSuat.map((nv, index) => (
                <tr key={index} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-3 font-bold text-slate-700 max-w-[120px] truncate">{nv.ten}</td>
                  <td className="px-2 py-3 text-center font-semibold text-slate-600">{nv.caCat}</td>
                  <td className="px-2 py-3 text-center font-semibold text-slate-600">{nv.caDong}</td>
                  <td className="px-2 py-3 text-center font-semibold text-slate-600">{nv.caTroNgai}</td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-blue-600">
                    {nv.tienThu > 0 ? `${nv.tienThu.toLocaleString('vi-VN')}đ` : '-'}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-slate-400 text-xs italic">
                    <i className="fa-solid fa-box-open text-2xl mb-2 block opacity-50"></i>
                    Không có dữ liệu trong khoảng thời gian này
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= POPUP DRILL-DOWN HIỂN THỊ DANH SÁCH CHI TIẾT TỐI ƯU SIÊU GỌN ================= */}
      {detailModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-3 fade-in backdrop-blur-sm">
          <div className="bg-slate-100 rounded-xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header Modal */}
            <div className={`p-3.5 flex justify-between items-center shrink-0 text-white ${detailModal.type === 'cat' ? 'bg-red-600' : detailModal.type === 'dong' ? 'bg-emerald-600' : 'bg-purple-600'}`}>
              <h3 className="font-bold text-xs uppercase tracking-wider flex items-center gap-2">
                <i className={`fa-solid ${detailModal.type === 'cat' ? 'fa-scissors' : detailModal.type === 'dong' ? 'fa-bolt' : 'fa-triangle-exclamation'}`}></i>
                {detailModal.title} ({detailModal.data.length})
              </h3>
              <button onClick={() => setDetailModal({ ...detailModal, isOpen: false })} className="text-white/80 hover:text-white"><i className="fa-solid fa-xmark text-lg"></i></button>
            </div>
            
            {/* Vùng danh sách dòng chảy siêu gọn */}
            <div className="p-2 overflow-y-auto space-y-1.5 no-scrollbar flex-1 bg-slate-50">
              {detailModal.data.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-12 italic">Không có hồ sơ phát sinh trong thời gian này.</p>
              ) : (
                detailModal.data.map((item, idx) => (
                  <div key={idx} onClick={() => handleJumpToProcess(item.customer_id)} className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 cursor-pointer hover:border-blue-400 hover:shadow active:scale-[0.99] transition-all relative overflow-hidden flex flex-col justify-center">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${detailModal.type === 'cat' ? 'bg-red-500' : detailModal.type === 'dong' ? 'bg-emerald-500' : 'bg-purple-500'}`}></div>
                    <div className="pl-2">
                      {/* Dòng 1: Mã PE + Ngày giờ thực hiện */}
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="font-mono font-bold text-[10px] text-blue-700 bg-blue-50 border border-blue-100 px-1 py-0.2 rounded">{item.ma_pe || 'TRỐNG MA'}</span>
                        <span className="text-[9px] font-medium text-slate-400"><i className="fa-regular fa-clock mr-1"></i>{new Date(item.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                      </div>
                      {/* Dòng 2: Tên khách hàng */}
                      <h4 className="font-bold text-xs text-slate-800 truncate">{item.ten_kh || 'Chưa rõ tên'}</h4>
                      {/* Dòng 3: Địa chỉ thu gọn */}
                      <p className="text-[10px] text-slate-400 truncate mt-0.5"><i className="fa-solid fa-location-dot text-slate-300 mr-1"></i>{item.dia_chi || 'Không có địa chỉ'}</p>
                      {/* Dòng 4: SĐT + Tên thợ thi công */}
                      <div className="flex justify-between items-center text-[9px] mt-1 pt-1 border-t border-slate-100">
                        <span className="font-bold text-slate-500">{item.so_dien_thoai ? `📞 ${item.so_dien_thoai}` : '❌ Không SĐT'}</span>
                        <span className="font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[8px]">Thợ: {item.nhan_vien}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Chân Modal nhắc nhở thao tác */}
            <div className="bg-white p-2 text-center border-t border-slate-200 shrink-0">
               <p className="text-[9px] text-slate-500 font-bold"><i className="fa-solid fa-hand-pointer text-blue-500 mr-1 animate-bounce"></i>Bấm vào dòng để mở Bảng Nghiệp Vụ Điều Hành</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
