import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx'; // Bổ sung thư viện đọc Excel

// Danh sách đội thợ giả định (Bạn có thể thay đổi tên thực tế của đơn vị)
const DANH_SACH_THO = ['Anh A', 'Anh B', 'Anh C', 'Anh D'];

export default function PhanCongDashboard() {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  
  // State điều khiển Giao diện
  const [activeWorkerCart, setActiveWorkerCart] = useState(null); // Giỏ của thợ nào đang được mở ra xem chi tiết
  const [selectedMicroTasks, setSelectedMicroTasks] = useState([]); // Mảng chứa ID các ca lẻ muốn chuyển cho người khác

  // ---------------- BỔ SUNG LÕI ĐỌC EXCEL ----------------
  const fileInputRef = useRef(null);

  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0]; // Lấy sheet đầu tiên
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // Chuẩn hóa dữ liệu từ cột Excel sang cột trong Database
        const danhSachNhap = jsonData.map(row => ({
          ma_pe: row['MÃ PE'] || row['MA_PE'] || row['Mã khách hàng'] || '',
          ten_kh: row['TÊN KHÁCH HÀNG'] || row['TEN_KH'] || row['Tên khách hàng'] || '',
          dia_chi: row['ĐỊA CHỈ'] || row['DIA_CHI'] || row['Địa chỉ'] || '',
          so_dien_thoai: row['SĐT'] || row['SO_DIEN_THOAI'] || row['Điện thoại'] || '',
          so_gcs: row['SỔ GCS'] || row['SO_GCS'] || row['Sổ GCS'] || '',
          trang_thai: 'cho_xu_ly', // Mặc định tất cả ca mới nạp lên là Chờ Xử Lý
          nguoi_phu_trach: null    // Chưa ai được giao
        })).filter(item => item.ma_pe); // Lọc bỏ các dòng trống không có Mã PE

        if (danhSachNhap.length === 0) {
          toast.error('File Excel trống hoặc sai tên cột!');
          return;
        }

        const toastId = toast.loading(`Đang nạp ${danhSachNhap.length} hồ sơ lên máy chủ...`);
        
        // Đẩy hàng loạt vào Supabase
        const { error } = await supabase.from('customers').insert(danhSachNhap);
        if (error) throw error;

        toast.success(`Đã nạp thành công ${danhSachNhap.length} hồ sơ!`, { id: toastId });
        fetchDanhSach(); // Tự động làm mới lại danh sách trên màn hình
      } catch (error) {
        console.error(error);
        toast.error('Có lỗi xảy ra khi đọc file Excel!');
      } finally {
        setLoading(false);
        e.target.value = ''; // Xóa rác trong input để có thể nạp file khác
      }
    };
    reader.readAsArrayBuffer(file);
  };
  // -------------------------------------------------------

  // Tải toàn bộ danh sách khách hàng (chưa xử lý xong)
  const fetchDanhSach = async () => {
    setLoading(true);
    try {
      // Chỉ lấy những hồ sơ chưa hoàn tất để phân công
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .neq('trang_thai', 'hoan_tat'); // Giả định hồ sơ xong thì không phân công lại

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      toast.error('Lỗi tải dữ liệu phân công!');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDanhSach();
  }, []);

  // ================= THUẬT TOÁN 1: LỌC TRỤ & GOM NHÓM KHO VIỆC =================
  // Lấy những ca chưa có người phụ trách
  const caChuaGiao = customers.filter(c => !c.nguoi_phu_trach);
  
  // Thuật toán Regex gọt vỏ lấy lõi Số Trụ
  const extractMaTru = (diaChi) => {
    if (!diaChi) return 'Không rõ trụ';
    // Quét tìm chữ "trụ" hoặc "tại trụ" và lấy mã liền sau nó (VD: BD12/2T/1, T45)
    const match = diaChi.match(/(?:trụ\s*|tại\s*trụ\s*|sau\s*trụ\s*)([a-zA-Z0-9/]+)/i);
    return match && match[1] ? match[1].toUpperCase() : 'Không rõ trụ';
  };

  // Gom nhóm Kho việc: Theo Sổ GCS -> Theo Cụm Trụ
  const khoViec = {};
  caChuaGiao.forEach(c => {
    const soGCS = c.so_gcs || 'Chưa rõ Sổ';
    const maTru = extractMaTru(c.dia_chi);
    // Gom để nhóm cụm trụ chính (VD: BD12/2T/1 -> Nhóm vào cụm BD12)
    const cumTruChinh = maTru !== 'Không rõ trụ' ? maTru.split('/')[0] : 'Cụm Lẻ';

    if (!khoViec[soGCS]) khoViec[soGCS] = {};
    if (!khoViec[soGCS][cumTruChinh]) khoViec[soGCS][cumTruChinh] = [];
    
    khoViec[soGCS][cumTruChinh].push(c);
  });

  // ================= THUẬT TOÁN 2: THỐNG KÊ GIỎ HÀNG CỦA THỢ =================
  const caDaGiao = customers.filter(c => c.nguoi_phu_trach);
  const gioViec = {};
  DANH_SACH_THO.forEach(tho => gioViec[tho] = []); // Khởi tạo giỏ rỗng cho mọi người
  caDaGiao.forEach(c => {
    if (!gioViec[c.nguoi_phu_trach]) gioViec[c.nguoi_phu_trach] = [];
    gioViec[c.nguoi_phu_trach].push(c);
  });

  // ================= HÀM XỬ LÝ: GIAO VIỆC THEO CỤM (MACRO) =================
  const handleGiaoCumTru = async (danhSachCa, tenTho) => {
    const ids = danhSachCa.map(c => c.id);
    const toastId = toast.loading(`Đang giao ${ids.length} ca cho ${tenTho}...`);
    try {
      const { error } = await supabase
        .from('customers')
        .update({ nguoi_phu_trach: tenTho })
        .in('id', ids);

      if (error) throw error;
      
      // Cập nhật giao diện lập tức (Realtime ảo)
      setCustomers(prev => prev.map(c => ids.includes(c.id) ? { ...c, nguoi_phu_trach: tenTho } : c));
      toast.success(`Đã đẩy vào giỏ ${tenTho}!`, { id: toastId });
    } catch (error) {
      toast.error('Lỗi khi phân công', { id: toastId });
    }
  };

  // ================= HÀM XỬ LÝ: CHUYỂN GIAO CA LẺ (MICRO TRANSFER) =================
  const toggleMicroTask = (id) => {
    setSelectedMicroTasks(prev => 
      prev.includes(id) ? prev.filter(taskId => taskId !== id) : [...prev, id]
    );
  };

  const handleChuyenGiaoCaLe = async (tenThoNhan) => {
    if (selectedMicroTasks.length === 0) return;
    const toastId = toast.loading(`Đang chuyển ${selectedMicroTasks.length} ca sang ${tenThoNhan}...`);
    try {
      const { error } = await supabase
        .from('customers')
        .update({ nguoi_phu_trach: tenThoNhan })
        .in('id', selectedMicroTasks);

      if (error) throw error;
      
      setCustomers(prev => prev.map(c => selectedMicroTasks.includes(c.id) ? { ...c, nguoi_phu_trach: tenThoNhan } : c));
      setSelectedMicroTasks([]); // Reset vùng chọn
      toast.success(`Đã chuyển cho ${tenThoNhan}!`, { id: toastId });
    } catch (error) {
      toast.error('Lỗi điều chuyển', { id: toastId });
    }
  };

  // ================= GIAO DIỆN =================
  return (
    <div className="w-full max-w-md mx-auto bg-slate-50 min-h-screen pb-24 flex flex-col fade-in">
      
      {/* HEADER TỔNG */}
      <div className="bg-white px-4 py-3 border-b border-slate-200 sticky top-0 z-10 shadow-sm flex justify-between items-center">
        <div>
          <h2 className="font-black text-lg text-slate-800 tracking-tight">ĐIỀU PHỐI <span className="text-blue-600">LỘ TRÌNH</span></h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase">Tổng: {caChuaGiao.length} ca chưa phân công</p>
        </div>
        <div className="flex gap-2">
          {/* Cửa hút file ẩn */}
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            ref={fileInputRef} 
            onChange={handleImportExcel} 
            className="hidden" 
          />
          {/* Nút bấm để gọi cửa hút file */}
          <button onClick={() => fileInputRef.current.click()} disabled={loading} className="bg-emerald-100 p-2 rounded-full text-emerald-600 hover:bg-emerald-200 hover:text-emerald-700 shadow-sm border border-emerald-200">
            <i className="fa-solid fa-file-excel"></i>
          </button>

          <button onClick={fetchDanhSach} disabled={loading} className="bg-slate-100 p-2 rounded-full text-slate-600 hover:bg-blue-100 hover:text-blue-600 shadow-sm border border-slate-200">
            <i className={`fa-solid fa-rotate ${loading ? 'animate-spin' : ''}`}></i>
          </button>
        </div>
      </div>

      {/* KHU VỰC 1: KHO VIỆC (CHƯA GIAO) */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto">
        <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2 mb-2">
          <i className="fa-solid fa-boxes-stacked"></i> Kho việc (Gom theo Trụ)
        </h3>
        
        {Object.keys(khoViec).length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
             <i className="fa-solid fa-check-double text-3xl mb-2 text-emerald-400"></i>
             <p className="text-xs font-bold uppercase">Đã phân công hết!</p>
          </div>
        ) : (
          Object.keys(khoViec).map(soGCS => (
            <div key={soGCS} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-3">
              <div className="bg-slate-100 px-3 py-2 border-b border-slate-200">
                <span className="text-[10px] font-black text-slate-700 uppercase bg-slate-200 px-2 py-0.5 rounded">SỔ {soGCS}</span>
              </div>
              
              <div className="p-2 space-y-2">
                {Object.keys(khoViec[soGCS]).map(cumTru => {
                  const danhSachCa = khoViec[soGCS][cumTru];
                  return (
                    <div key={cumTru} className="border border-blue-100 bg-blue-50/30 rounded-lg p-2 relative group">
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <h4 className="font-bold text-blue-800 text-sm"><i className="fa-solid fa-bolt text-yellow-500 mr-1"></i> Tuyến {cumTru}</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Bao gồm {danhSachCa.length} ca nợ cước</p>
                        </div>
                      </div>
                      
                      {/* NÚT CHIA BÀI 1 CHẠM TRỰC TIẾP LÊN TÊN THỢ */}
                      <div className="flex flex-wrap gap-1.5 border-t border-blue-100 pt-2 mt-1">
                        <span className="text-[9px] text-slate-400 w-full font-bold uppercase mb-0.5">Đẩy nhanh vào giỏ:</span>
                        {DANH_SACH_THO.map(tho => (
                          <button 
                            key={tho} 
                            onClick={() => handleGiaoCumTru(danhSachCa, tho)}
                            className="bg-white border border-slate-200 hover:border-blue-500 hover:bg-blue-50 active:scale-95 px-2 py-1 rounded shadow-sm text-[10px] font-bold text-slate-600 transition-all flex items-center gap-1"
                          >
                            {tho} <span className="bg-slate-100 text-slate-400 px-1 rounded text-[8px]">{gioViec[tho]?.length || 0}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* KHU VỰC 2: GIỎ HÀNG THỢ (ĐÃ GIAO) - FIXED Ở NỬA DƯỚI MÀN HÌNH */}
      <div className="bg-white border-t border-slate-200 rounded-t-2xl shadow-[0_-5px_15px_-3px_rgba(0,0,0,0.05)] mt-auto z-20 transition-all duration-300 relative">
        <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto my-2"></div>
        <div className="px-4 pb-2">
          <h3 className="text-xs font-bold text-slate-800 uppercase flex items-center justify-between mb-3">
            <span><i className="fa-solid fa-users text-blue-600 mr-1"></i> Giỏ Việc Nhân Viên</span>
            <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-[9px]">{caDaGiao.length} Đã giao</span>
          </h3>
          
          {/* LƯỚI GIỎ HÀNG */}
          <div className="grid grid-cols-2 gap-2 max-h-[30vh] overflow-y-auto no-scrollbar pb-4">
            {DANH_SACH_THO.map(tho => {
              const soCa = gioViec[tho]?.length || 0;
              const isActive = activeWorkerCart === tho;
              return (
                <div 
                  key={tho} 
                  onClick={() => setActiveWorkerCart(isActive ? null : tho)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${isActive ? 'bg-blue-600 border-blue-700 shadow-lg scale-[1.02]' : soCa > 0 ? 'bg-gradient-to-br from-slate-50 to-blue-50 border-blue-200 hover:border-blue-400' : 'bg-slate-50 border-slate-200 opacity-70'}`}
                >
                  <div className="flex justify-between items-start">
                    <span className={`font-black text-sm ${isActive ? 'text-white' : 'text-slate-700'}`}>{tho}</span>
                    <i className={`fa-solid fa-basket-shopping ${isActive ? 'text-blue-300' : soCa > 0 ? 'text-blue-400' : 'text-slate-300'}`}></i>
                  </div>
                  <div className={`mt-2 font-mono font-black text-xl ${isActive ? 'text-white' : soCa > 0 ? 'text-blue-700' : 'text-slate-400'}`}>
                    {soCa} <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">Ca</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* CỬA SỔ BẬT LÊN KHI BẤM VÀO GIỎ HÀNG CỦA 1 THỢ (ĐỂ ĐIỀU CHUYỂN CA LẺ) */}
        {activeWorkerCart && (
          <div className="absolute bottom-[100%] left-0 w-full bg-slate-100 border-t border-slate-300 shadow-2xl h-[50vh] flex flex-col z-30 slide-up rounded-t-xl">
            <div className="bg-blue-700 p-3 flex justify-between items-center text-white rounded-t-xl shrink-0">
              <h4 className="font-bold text-sm uppercase">Giỏ của {activeWorkerCart} ({gioViec[activeWorkerCart]?.length} ca)</h4>
              <button onClick={() => { setActiveWorkerCart(null); setSelectedMicroTasks([]); }} className="text-white/80 hover:text-white"><i className="fa-solid fa-xmark text-lg"></i></button>
            </div>
            
            <div className="p-1 bg-yellow-100 text-yellow-800 text-[10px] font-bold text-center border-b border-yellow-200">
              <i className="fa-solid fa-circle-info mr-1"></i> Tick chọn các ca lẻ bên dưới để điều chuyển qua thợ khác
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 no-scrollbar">
              {gioViec[activeWorkerCart]?.length === 0 ? (
                <p className="text-center text-slate-400 text-xs mt-10 italic">Giỏ hàng trống.</p>
              ) : (
                // Sắp xếp danh sách hiển thị theo Số Trụ để dễ dàng chọn ca giáp ranh
                [...gioViec[activeWorkerCart]].sort((a,b) => extractMaTru(a.dia_chi).localeCompare(extractMaTru(b.dia_chi))).map(c => (
                  <div 
                    key={c.id} 
                    onClick={() => toggleMicroTask(c.id)}
                    className={`flex items-center p-2 bg-white rounded-lg border cursor-pointer transition-colors ${selectedMicroTasks.includes(c.id) ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="mr-3 ml-1 text-lg">
                      <i className={`fa-regular ${selectedMicroTasks.includes(c.id) ? 'fa-square-check text-blue-600' : 'fa-square text-slate-300'}`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between mb-0.5">
                        <span className="font-bold text-[10px] text-slate-500 bg-slate-100 px-1 rounded truncate max-w-[100px]"><i className="fa-solid fa-location-dot mr-1"></i>{extractMaTru(c.dia_chi)}</span>
                        <span className="font-mono font-bold text-[10px] text-blue-700">{c.ma_pe}</span>
                      </div>
                      <h5 className="font-bold text-xs text-slate-800 truncate">{c.ten_kh}</h5>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* THANH CÔNG CỤ NỔI KHI CÓ TICK CHỌN CA LẺ */}
            {selectedMicroTasks.length > 0 && (
              <div className="bg-white border-t border-slate-200 p-3 shrink-0 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.1)] slide-up">
                <div className="text-[10px] font-bold text-slate-500 mb-2 text-center uppercase tracking-wider">
                  Chuyển {selectedMicroTasks.length} ca này sang cho:
                </div>
                <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar">
                  {DANH_SACH_THO.filter(t => t !== activeWorkerCart).map(thoNhan => (
                    <button 
                      key={thoNhan}
                      onClick={() => handleChuyenGiaoCaLe(thoNhan)}
                      className="shrink-0 bg-blue-100 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 px-4 py-2 rounded-lg font-bold text-xs transition-colors flex items-center gap-1"
                    >
                      {thoNhan}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
