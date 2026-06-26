import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { toast } from 'react-hot-toast';

export default function ThongKeDashboard() {
  // Lấy ngày hiện tại mặc định
  const today = new Date();
  // Điều chỉnh múi giờ (Tránh lỗi nhảy ngày do lệch múi giờ GMT+7)
  const tzOffset = today.getTimezoneOffset() * 60000;
  const todayStr = new Date(today.getTime() - tzOffset).toISOString().split('T')[0];
  
  const [tuNgay, setTuNgay] = useState(todayStr);
  const [denNgay, setDenNgay] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);

  // Hàm kéo dữ liệu từ bảng suspension_logs theo ngày
  const fetchThongKe = async () => {
    setLoading(true);
    try {
      // Ép thời gian từ 00:00:00 của Từ Ngày đến 23:59:59 của Đến Ngày
      const startDateTime = `${tuNgay}T00:00:00.000Z`;
      const endDateTime = `${denNgay}T23:59:59.999Z`;

      const { data, error } = await supabase
        .from('suspension_logs')
        .select('*')
        .gte('created_at', startDateTime)
        .lte('created_at', endDateTime)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      toast.error('Lỗi tải dữ liệu thống kê');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Tự động chạy lại khi người dùng đổi ngày
  useEffect(() => {
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

      {/* Khối 2: Toàn Cảnh Chiến Dịch */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-red-50 to-rose-100 p-4 rounded-xl border border-red-200 shadow-sm flex flex-col items-center justify-center text-center relative overflow-hidden group">
          <i className="fa-solid fa-scissors text-red-500 text-2xl mb-1 group-hover:scale-110 transition-transform"></i>
          <span className="text-3xl font-black text-red-700">{tongQuan.caCat}</span>
          <span className="text-[10px] font-bold text-red-600 uppercase mt-1">Đã Cắt Điện</span>
        </div>
        
        <div className="bg-gradient-to-br from-emerald-50 to-green-100 p-4 rounded-xl border border-emerald-200 shadow-sm flex flex-col items-center justify-center text-center relative overflow-hidden group">
          <i className="fa-solid fa-bolt text-emerald-500 text-2xl mb-1 group-hover:scale-110 transition-transform"></i>
          <span className="text-3xl font-black text-emerald-700">{tongQuan.caDong}</span>
          <span className="text-[10px] font-bold text-emerald-600 uppercase mt-1">Đã Đóng Điện</span>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-fuchsia-100 p-4 rounded-xl border border-purple-200 shadow-sm flex flex-col items-center justify-center text-center relative overflow-hidden group">
          <i className="fa-solid fa-triangle-exclamation text-purple-500 text-2xl mb-1 group-hover:scale-110 transition-transform"></i>
          <span className="text-3xl font-black text-purple-700">{tongQuan.caTroNgai}</span>
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

    </div>
  );
}
