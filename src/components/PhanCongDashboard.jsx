import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';

const DANH_SACH_THO = ['Anh A', 'Anh B', 'Anh C', 'Anh D'];

export default function PhanCongDashboard() {
  const [loading, setLoading] = useState(false);
  const [danhSach, setDanhSach] = useState([]);
  const [danhMucTram, setDanhMucTram] = useState([]);
  
  const [activeWorkerCart, setActiveWorkerCart] = useState(null);
  const [selectedMicroTasks, setSelectedMicroTasks] = useState([]);
  const fileInputRef = useRef(null);

  // 1. TẢI DỮ LIỆU ĐỒNG THỜI TỪ 2 BẢNG
  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Tải từ điển trạm
      const { data: tramData, error: tramErr } = await supabase.from('danh_muc_tram').select('*');
      if (tramErr) throw tramErr;
      setDanhMucTram(tramData || []);

      // Tải danh sách đốc thu (Chỉ ca chưa xử lý hoặc hẹn lại)
      const { data: dsData, error: dsErr } = await supabase
        .from('danh_sach_doc_thu')
        .select('*')
        .in('trang_thai_hien_tai', ['chua_xu_ly', 'hen_lai']);
      if (dsErr) throw dsErr;
      
      setDanhSach(dsData || []);
    } catch (error) {
      toast.error('Lỗi kết nối cơ sở dữ liệu!');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // HÀM HỖ TRỢ: BÓC SỐ TRỤ VÀ HÓA GIẢI GÕ TẮT (VD: 5/ -> 475CĐ/)
  const extractAndFixPole = (address, tuyenGoc) => {
    if (!address) return 'Không rõ trụ';
    let str = address.toUpperCase().replace(/ẤTRỤ/g, 'TRỤ');
    str = str.replace(/([A-ZĐ0-9])(XÃ|ẤP|KHÓM|PHƯỜNG|TỔ|HUYỆN|TỈNH|THỊ|KCN)/g, '$1 $2');

    // Lấy chuỗi nằm sau chữ TRỤ cuối cùng
    const allPoles = [...str.matchAll(/TRỤ\s+([A-ZĐ0-9/.\-]+)/g)];
    let pole = allPoles.length > 0 ? allPoles[allPoles.length - 1][1].replace(/[.,;]+$/, '') : 'Không rõ trụ';

    // Nếu có tuyến gốc, thử dịch mã gõ tắt (1/, 5/, 8/)
    if (tuyenGoc && pole !== 'Không rõ trụ') {
      const matchShorthand = pole.match(/^(\d+)\//); // Tìm số đứng trước dấu /
      if (matchShorthand) {
        const shortNum = matchShorthand[1];
        // Nếu số gõ tắt (VD: 5) trùng với số của tuyến mẹ (VD: 475) thì thay thế
        if (tuyenGoc.includes(shortNum)) {
          pole = pole.replace(`${shortNum}/`, `${tuyenGoc}/`);
        }
      }
    }
    return pole;
  };

  // 2. NHAI EXCEL VÀ LÀM GIÀU DỮ LIỆU TẠI NGUỒN
  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        const danhSachNhap = jsonData.map(row => {
          // A. Làm sạch cơ bản (Tên, Số điện thoại, Tiền)
          let rawName = row['TÊN KHÁCH HÀNG'] || row['TEN_KH'] || '';
          let phone = '';
          const phoneMatch = rawName.match(/(?:\(|\[)?(?:DT|ĐT|SĐT)[:\s]*([0-9]{9,11})(?:\)|\])?/i);
          if (phoneMatch) {
            phone = phoneMatch[1];
            rawName = rawName.replace(phoneMatch[0], '').trim();
          }

          let rawTien = row['SỐ TIỀN'] || row['TỔNG TIỀN'] || 0;
          let cleanTien = typeof rawTien === 'string' ? parseInt(rawTien.replace(/[^0-9]/g, ''), 10) : rawTien;

          // B. Lấy các thông số điều hướng
          const soGCS = row['SỔ GCS'] || '';
          const rawAddress = row['ĐỊA CHỈ'] || '';
          const tuyenExcel = row['TUYẾN'] || row['MÃ LƯỚI'] || '';

          // C. BỘ NÃO NHÓM DỮ LIỆU CHÍNH (Kết hợp Trạm và VLOOKUP)
          let nhomPhanCong = 'Cụm Lẻ';
          let maTruSach = 'Không rõ trụ';

          // Đối chiếu Sổ GCS với Bảng Danh mục Trạm
          const tramKhop = danhMucTram.find(t => t.so_gcs == soGCS);

          if (tramKhop) {
            // CA 1: KHÁCH HÀNG THUỘC TRẠM CÔNG CỘNG (Ánh sáng sinh hoạt)
            nhomPhanCong = tramKhop.ten_tram; 
            maTruSach = extractAndFixPole(rawAddress, tramKhop.tuyen_goc);
          } else if (tuyenExcel) {
            // CA 2: KHÁCH HÀNG TRUNG THẾ ĐỘC LẬP (Sử dụng dữ liệu VLOOKUP từ CMIS)
            const tuyenChuan = tuyenExcel.toUpperCase().replace(/TUYẾN\s*/g, '');
            nhomPhanCong = `Tuyến ${tuyenChuan}`;
            maTruSach = extractAndFixPole(rawAddress, tuyenChuan);
          } else {
            // CA 3: LỌT SÀNG (Đẩy vào Cụm lẻ)
            maTruSach = extractAndFixPole(rawAddress, null);
          }

          return {
            ma_pe: row['MÃ PE'] || row['MA_PE'] || '',
            ten_kh: rawName,
            dia_chi: rawAddress,
            so_dien_thoai: phone,
            so_gcs: soGCS,
            ky_hoa_don: row['KỲ HÓA ĐƠN'] || 'Chưa rõ',
            so_tien: isNaN(cleanTien) ? 0 : cleanTien,
            nhom_phan_cong: nhomPhanCong,  // LƯU KẾT QUẢ ĐÃ GOM NHÓM
            ma_tru_sach: maTruSach,        // LƯU KẾT QUẢ TRỤ ĐÃ RỬA
            trang_thai_hien_tai: 'chua_xu_ly', 
            nguoi_phu_trach: null
          };
        }).filter(item => item.ma_pe);

        if (danhSachNhap.length === 0) return toast.error('File Excel trống!');

        const toastId = toast.loading(`Đang nạp ${danhSachNhap.length} hồ sơ...`);
        const { error } = await supabase.from('danh_sach_doc_thu').insert(danhSachNhap);
        if (error) throw error;

        toast.success(`Nạp thành công ${danhSachNhap.length} hồ sơ!`, { id: toastId });
        fetchAllData(); 
      } catch (error) {
        toast.error('Có lỗi xảy ra khi nạp file!');
      } finally {
        setLoading(false);
        e.target.value = ''; 
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // 3. TẠO KHO VIỆC (Bây giờ code nhẹ tênh vì data đã được rửa sạch)
  const caChuaGiao = danhSach.filter(c => !c.nguoi_phu_trach);
  const caDaGiao = danhSach.filter(c => c.nguoi_phu_trach);

  const khoViec = {};
  caChuaGiao.forEach(c => {
    const nhom = c.nhom_phan_cong;
    if (!khoViec[nhom]) khoViec[nhom] = [];
    khoViec[nhom].push(c);
  });

  const gioViec = {};
  DANH_SACH_THO.forEach(tho => gioViec[tho] = []);
  caDaGiao.forEach(c => {
    if (!gioViec[c.nguoi_phu_trach]) gioViec[c.nguoi_phu_trach] = [];
    gioViec[c.nguoi_phu_trach].push(c);
  });

  // 4. CHỨC NĂNG CHIA CA
  const handleGiaoCumTru = async (danhSachCa, tenTho) => {
    const ids = danhSachCa.map(c => c.id);
    const toastId = toast.loading(`Giao ${ids.length} ca cho ${tenTho}...`);
    try {
      const { error } = await supabase.from('danh_sach_doc_thu').update({ nguoi_phu_trach: tenTho }).in('id', ids);
      if (error) throw error;
      setDanhSach(prev => prev.map(c => ids.includes(c.id) ? { ...c, nguoi_phu_trach: tenTho } : c));
      toast.success(`Xong!`, { id: toastId });
    } catch (error) {
      toast.error('Lỗi khi phân công', { id: toastId });
    }
  };

  const toggleMicroTask = (id) => setSelectedMicroTasks(prev => prev.includes(id) ? prev.filter(tId => tId !== id) : [...prev, id]);

  const handleChuyenGiaoCaLe = async (tenThoNhan) => {
    if (selectedMicroTasks.length === 0) return;
    const toastId = toast.loading(`Chuyển ca sang ${tenThoNhan}...`);
    try {
      const { error } = await supabase.from('danh_sach_doc_thu').update({ nguoi_phu_trach: tenThoNhan }).in('id', selectedMicroTasks);
      if (error) throw error;
      setDanhSach(prev => prev.map(c => selectedMicroTasks.includes(c.id) ? { ...c, nguoi_phu_trach: tenThoNhan } : c));
      setSelectedMicroTasks([]);
      toast.success(`Thành công!`, { id: toastId });
    } catch (error) {
      toast.error('Lỗi điều chuyển', { id: toastId });
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-slate-50 min-h-screen pb-24 flex flex-col fade-in">
      <div className="bg-white px-4 py-3 border-b border-slate-200 sticky top-0 z-10 shadow-sm flex justify-between items-center">
        <div>
          <h2 className="font-black text-lg text-slate-800 tracking-tight">ĐIỀU PHỐI <span className="text-blue-600">ĐỐC THU</span></h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase">Tổng: {caChuaGiao.length} ca chưa phân công</p>
        </div>
        <div className="flex gap-2">
          <input type="file" accept=".xlsx, .xls" ref={fileInputRef} onChange={handleImportExcel} className="hidden" />
          <button onClick={() => fileInputRef.current.click()} disabled={loading} className="bg-emerald-100 p-2 rounded-full text-emerald-600 shadow-sm border border-emerald-200">
            <i className="fa-solid fa-file-excel"></i>
          </button>
          <button onClick={fetchAllData} disabled={loading} className="bg-slate-100 p-2 rounded-full text-slate-600 shadow-sm border border-slate-200">
            <i className={`fa-solid fa-rotate ${loading ? 'animate-spin' : ''}`}></i>
          </button>
        </div>
      </div>

      {/* KHO VIỆC LÀM SẠCH */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto">
        <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2 mb-2">
          <i className="fa-solid fa-layer-group"></i> Kho Việc (Trạm & Tuyến)
        </h3>
        
        {Object.keys(khoViec).length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
             <i className="fa-solid fa-mug-hot text-3xl mb-2 text-emerald-400"></i>
             <p className="text-xs font-bold uppercase">Kho việc đã sạch bách!</p>
          </div>
        ) : (
          Object.keys(khoViec).sort().map(nhom => {
            const danhSachCa = khoViec[nhom];
            // Render Icon dựa trên việc đó là Trạm hay Tuyến trung thế
            const isTram = nhom.toLowerCase().includes('trạm');
            return (
              <div key={nhom} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-3">
                <div className={`px-3 py-2 border-b flex justify-between items-center ${isTram ? 'bg-amber-50 border-amber-100' : 'bg-blue-50 border-blue-100'}`}>
                  <span className={`text-xs font-black uppercase ${isTram ? 'text-amber-800' : 'text-blue-800'}`}>
                    <i className={`fa-solid ${isTram ? 'fa-transformer text-amber-500' : 'fa-bolt text-blue-500'} mr-2`}></i>
                    {nhom}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded shadow-sm">{danhSachCa.length} ca</span>
                </div>
                
                <div className="p-2">
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[9px] text-slate-400 w-full font-bold uppercase mb-0.5">Giao nguyên cụm cho:</span>
                    {DANH_SACH_THO.map(tho => (
                      <button 
                        key={tho} 
                        onClick={() => handleGiaoCumTru(danhSachCa, tho)}
                        className="bg-white border border-slate-200 hover:border-blue-500 hover:bg-blue-50 px-2 py-1.5 rounded shadow-sm text-[10px] font-bold text-slate-600 transition-all flex items-center gap-1 flex-1 justify-center"
                      >
                        {tho} <span className="bg-slate-100 text-slate-400 px-1 rounded text-[8px]">{gioViec[tho]?.length || 0}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* GIỎ HÀNG THỢ */}
      <div className="bg-white border-t border-slate-200 rounded-t-2xl shadow-[0_-5px_15px_-3px_rgba(0,0,0,0.05)] mt-auto z-20 transition-all duration-300 relative">
        <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto my-2"></div>
        <div className="px-4 pb-2">
          <h3 className="text-xs font-bold text-slate-800 uppercase flex items-center justify-between mb-3">
            <span><i className="fa-solid fa-users text-blue-600 mr-1"></i> Giỏ Việc Nhân Viên</span>
            <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-[9px]">{caDaGiao.length} Đã giao</span>
          </h3>
          
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

        {/* POPUP ĐIỀU CHUYỂN CA LẺ */}
        {activeWorkerCart && (
          <div className="absolute bottom-[100%] left-0 w-full bg-slate-100 border-t border-slate-300 shadow-2xl h-[50vh] flex flex-col z-30 slide-up rounded-t-xl">
            <div className="bg-blue-700 p-3 flex justify-between items-center text-white rounded-t-xl shrink-0">
              <h4 className="font-bold text-sm uppercase">Giỏ của {activeWorkerCart} ({gioViec[activeWorkerCart]?.length} ca)</h4>
              <button onClick={() => { setActiveWorkerCart(null); setSelectedMicroTasks([]); }} className="text-white/80 hover:text-white"><i className="fa-solid fa-xmark text-lg"></i></button>
            </div>
            
            <div className="p-1 bg-yellow-100 text-yellow-800 text-[10px] font-bold text-center border-b border-yellow-200">
              <i className="fa-solid fa-circle-info mr-1"></i> Tick chọn các ca lẻ để điều chuyển
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 no-scrollbar">
              {gioViec[activeWorkerCart]?.length === 0 ? (
                <p className="text-center text-slate-400 text-xs mt-10 italic">Giỏ hàng trống.</p>
              ) : (
                [...gioViec[activeWorkerCart]].sort((a,b) => a.nhom_phan_cong.localeCompare(b.nhom_phan_cong)).map(c => (
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
                        <span className="font-bold text-[10px] text-slate-500 bg-slate-100 px-1 rounded truncate max-w-[120px]" title={c.ma_tru_sach}>
                          <i className="fa-solid fa-location-dot mr-1"></i>{c.ma_tru_sach}
                        </span>
                        <span className="font-mono font-bold text-[10px] text-blue-700 bg-blue-50 px-1 rounded">{c.ma_pe}</span>
                      </div>
                      <h5 className="font-bold text-xs text-slate-800 truncate">{c.ten_kh}</h5>
                      <p className="text-[10px] text-slate-500 mt-0.5 font-medium"><i className="fa-solid fa-layer-group mr-1 text-slate-300"></i>Nhóm: {c.nhom_phan_cong}</p>
                      <p className="text-[11px] font-black text-red-500 mt-0.5">
                        <i className="fa-solid fa-money-bill-wave mr-1"></i> 
                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(c.so_tien || 0)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {selectedMicroTasks.length > 0 && (
              <div className="bg-white border-t border-slate-200 p-3 shrink-0 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.1)] slide-up">
                <div className="text-[10px] font-bold text-slate-500 mb-2 text-center uppercase tracking-wider">
                  Chuyển {selectedMicroTasks.length} ca sang:
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
