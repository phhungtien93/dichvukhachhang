import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';

const DANH_SACH_THO = ['Anh A', 'Anh B', 'Anh C', 'Anh D'];

export default function PhanCongDashboard() {
  const [loading, setLoading] = useState(false);
  const [danhSach, setDanhSach] = useState([]);
  
  const [danhMucTram, setDanhMucTram] = useState([]);
  const [danhMucTienTo, setDanhMucTienTo] = useState([]); 
  
  const [activeWorkerCart, setActiveWorkerCart] = useState(null);
  const [selectedMicroTasks, setSelectedMicroTasks] = useState([]);
  const fileInputRef = useRef(null);

  // === CHÈN THÊM ĐOẠN NÀY ===
  const [expandedGroups, setExpandedGroups] = useState({}); // State lưu trạng thái đóng/mở chi tiết
  // === CHÈN THÊM STATE NÀY NGAY DƯỚI expandedGroups ===
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  // === CHÈN THÊM BIẾN NÀY ===
  const [overviewTab, setOverviewTab] = useState('hen_lai'); // 'hen_lai' hoặc 'da_thu'

  const toggleGroup = (soGCS, nhom) => {
    const groupId = `${soGCS}-${nhom}`;
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };
  
  // 1. TẢI DỮ LIỆU TỪ SUPABASE
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const { data: tramData } = await supabase.from('danh_muc_tram').select('*');
      setDanhMucTram(tramData || []);

      const { data: tienToData } = await supabase.from('danh_muc_ma_xuat_tuyen').select('*');
      setDanhMucTienTo(tienToData || []);

      // Tải danh sách đốc thu (Bổ sung thêm da_thu để đếm ở Tổng quan)
      const { data: dsData, error: dsErr } = await supabase
        .from('danh_sach_doc_thu')
        .select('*')
        .in('trang_thai_hien_tai', ['chua_xu_ly', 'hen_lai', 'da_thu']);
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

  // HÀM HỖ TRỢ: RỬA SỐ TRỤ
  const extractAndFixPole = (address, tuyenGoc) => {
    if (!address) return 'Không rõ trụ';
    let str = address.toUpperCase().replace(/ẤTRỤ/g, 'TRỤ');
    str = str.replace(/([A-ZĐ0-9])(XÃ|ẤP|KHÓM|PHƯỜNG|TỔ|HUYỆN|TỈNH|THỊ|KCN)/g, '$1 $2');

    const allPoles = [...str.matchAll(/TRỤ\s+([A-ZĐ0-9/.\-]+)/g)];
    let pole = allPoles.length > 0 ? allPoles[allPoles.length - 1][1].replace(/[.,;]+$/, '') : 'Không rõ trụ';

    if (tuyenGoc && pole !== 'Không rõ trụ') {
      const matchShorthand = pole.match(/^(\d+)\//); 
      if (matchShorthand) {
        const shortNum = matchShorthand[1];
        if (tuyenGoc.includes(shortNum)) {
          pole = pole.replace(`${shortNum}/`, `${tuyenGoc}/`);
        }
      }
    }
    return pole;
  };

  // 2. NHAI EXCEL VÀ DỊCH MÃ TRUNG THẾ
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
          let rawName = row['TÊN KHÁCH HÀNG'] || row['TEN_KH'] || '';
          let phone = '';
          const phoneMatch = rawName.match(/(?:\(|\[)?(?:DT|ĐT|SĐT)[:\s]*([0-9]{9,11})(?:\)|\])?/i);
          if (phoneMatch) {
            phone = phoneMatch[1];
            rawName = rawName.replace(phoneMatch[0], '').trim();
          }

          let rawTien = row['SỐ TIỀN'] || row['TỔNG TIỀN'] || 0;
          let cleanTien = typeof rawTien === 'string' ? parseInt(rawTien.replace(/[^0-9]/g, ''), 10) : rawTien;

          const soGCS = row['SỔ GCS'] || '';
          const rawAddress = row['ĐỊA CHỈ'] || '';
          const tuyenExcel = row['TUYẾN'] || row['MÃ LƯỚI'] || row['MÃ XUẤT TUYẾN'] || row['MÃ TUYẾN'] || '';

          let nhomPhanCong = 'Cụm Lẻ';
          let maTruSach = 'Không rõ trụ';

          const tramKhop = danhMucTram.find(t => t.so_gcs == soGCS);

          if (tramKhop) {
            // CA 1: Thuộc Trạm Công Cộng
            nhomPhanCong = tramKhop.ten_tram; 
            maTruSach = extractAndFixPole(rawAddress, tramKhop.tuyen_goc);
          } 
          else if (tuyenExcel) {
            // CA 2: Không thuộc Trạm công cộng nhưng CÓ cột Tuyến Excel
            let tuyenChuan = tuyenExcel.toUpperCase().trim();
            const matchDichMa = tuyenChuan.match(/^(PB\d{4})(\d+)$/i);
            
            if (matchDichMa) {
              const tienTo = matchDichMa[1];
              const soTuyen = matchDichMa[2];
              const tuDien = danhMucTienTo.find(d => d.ma_tien_to === tienTo);
              if (tuDien) tuyenChuan = `${soTuyen}${tuDien.hau_to}`;
            } else {
              tuyenChuan = tuyenChuan.replace(/TUYẾN\s*/g, '');
            }
            nhomPhanCong = `Tuyến ${tuyenChuan}`; 
            maTruSach = extractAndFixPole(rawAddress, tuyenChuan); 
          } 
          else {
            // CA 3: BỘ CỨU HỘ (Không có Sổ, Không có cột Excel -> Tự mò Tuyến trong địa chỉ)
            const fallbackMatch = rawAddress.toUpperCase().match(/(471CD|472CD|473CD|474CD|475CD|476CD|477CD|478CD|487CD|473D|472CĐ|474CĐ|475CĐ|476CĐ|478CĐ|MT1)/i);
            if (fallbackMatch) {
              nhomPhanCong = `Tuyến ${fallbackMatch[1]}`;
              maTruSach = extractAndFixPole(rawAddress, fallbackMatch[1]);
            } else {
              maTruSach = extractAndFixPole(rawAddress, null);
            }
          }

          return {
            ma_pe: row['MÃ PE'] || row['MA_PE'] || '',
            ten_kh: rawName,
            dia_chi: rawAddress,
            so_dien_thoai: phone,
            so_gcs: soGCS,
            ky_hoa_don: row['KỲ HÓA ĐƠN'] || 'Chưa rõ',
            so_tien: isNaN(cleanTien) ? 0 : cleanTien,
            nhom_phan_cong: nhomPhanCong,  
            ma_tru_sach: maTruSach,        
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

  // 3. TẠO KHO VIỆC 2 TẦNG (SỔ GCS -> TRẠM/TUYẾN) ĐÚNG CHUẨN NGHIỆP VỤ
  // Loại bỏ ca 'da_thu' để không hiển thị lại ở Kho Việc và Giỏ Việc
  const caChuaGiao = danhSach.filter(c => !c.nguoi_phu_trach && c.trang_thai_hien_tai !== 'da_thu');
  const caDaGiao = danhSach.filter(c => c.nguoi_phu_trach && c.trang_thai_hien_tai !== 'da_thu');

  const khoViec = {};
  caChuaGiao.forEach(c => {
    const soGCS = c.so_gcs || 'Chưa rõ Sổ';
    const nhom = c.nhom_phan_cong; // Đây là tên Trạm hoặc tên Tuyến
    
    if (!khoViec[soGCS]) khoViec[soGCS] = {};
    if (!khoViec[soGCS][nhom]) khoViec[soGCS][nhom] = [];
    
    khoViec[soGCS][nhom].push(c);
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

      {/* KHO VIỆC 2 TẦNG (GOM THEO SỔ GCS CHUẨN) */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto">
        {/* ================= BẮT ĐẦU CHÈN THÊM KHU VỰC TỔNG QUAN ================= */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-2 fade-in shrink-0">
          <button
            onClick={() => setIsOverviewExpanded(!isOverviewExpanded)}
            className="w-full flex justify-between items-center p-3 bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            <h3 className="text-xs font-black text-blue-800 uppercase tracking-wider flex items-center gap-2">
              <i className="fa-solid fa-chart-pie text-blue-500"></i> Tổng Quan Giao Dịch
            </h3>
            <i className={`fa-solid fa-chevron-down text-blue-500 transition-transform ${isOverviewExpanded ? 'rotate-180' : ''}`}></i>
          </button>

          {isOverviewExpanded && (
            <div className="p-3 border-t border-blue-100 bg-slate-50 space-y-3 shadow-inner">
              <div className="grid grid-cols-2 gap-3">
                
                {/* THẺ 1: KHÁCH HẸN LẠI - Bấm để chọn tab */}
                <div 
                  onClick={() => setOverviewTab('hen_lai')}
                  className={`border rounded-xl p-3 shadow-sm relative overflow-hidden cursor-pointer transition-all active:scale-95 select-none ${
                    overviewTab === 'hen_lai' 
                      ? 'bg-orange-100/70 border-orange-400 ring-2 ring-orange-400 shadow-md scale-[1.02]' 
                      : 'bg-orange-50 border-orange-200 opacity-60'
                  }`}
                >
                  <div className="absolute -right-2 -top-2 text-orange-200/50 text-4xl"><i className="fa-solid fa-clock-rotate-left"></i></div>
                  <div className="relative z-10">
                    <div className="font-black text-2xl text-orange-700 mb-1">{danhSach.filter(c => c.trang_thai_hien_tai === 'hen_lai').length}</div>
                    <p className="text-[10px] font-black text-orange-800 uppercase tracking-wide">Khách hẹn lại</p>
                    <p className="text-[9px] text-orange-600 mt-0.5 font-bold">Cần nhắc đi thu</p>
                  </div>
                </div>

                {/* THẺ 2: ĐÃ THU TIỀN - Bấm để chọn tab */}
                <div 
                  onClick={() => setOverviewTab('da_thu')}
                  className={`border rounded-xl p-3 shadow-sm relative overflow-hidden cursor-pointer transition-all active:scale-95 select-none ${
                    overviewTab === 'da_thu' 
                      ? 'bg-emerald-100/70 border-emerald-400 ring-2 ring-emerald-400 shadow-md scale-[1.02]' 
                      : 'bg-emerald-50 border-emerald-200 opacity-60'
                  }`}
                >
                  <div className="absolute -right-2 -top-2 text-emerald-200/50 text-4xl"><i className="fa-solid fa-money-bill-wave"></i></div>
                  <div className="relative z-10">
                    <div className="font-black text-2xl text-emerald-700 mb-1">{danhSach.filter(c => c.trang_thai_hien_tai === 'da_thu').length}</div>
                    <p className="text-[10px] font-black text-emerald-800 uppercase tracking-wide">Đã thu tiền</p>
                    <p className="text-[9px] text-emerald-600 mt-0.5 font-bold">Chờ văn phòng đối soát</p>
                  </div>
                </div>
              </div>

              {/* BẢNG HIỂN THỊ CHI TIẾT DANH SÁCH ĐỘNG THEO TAB */}
              <div className="mt-3 border-t border-slate-200 pt-3">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                  <i className={`fa-solid ${overviewTab === 'hen_lai' ? 'fa-clock-rotate-left text-orange-500' : 'fa-money-bill-wave text-emerald-500'}`}></i> 
                  Chi tiết: {overviewTab === 'hen_lai' ? 'Danh sách khách hẹn khất nợ' : 'Danh sách ca thợ đã thu xong'}
                </p>
                
                <div className="space-y-1.5 max-h-44 overflow-y-auto no-scrollbar">
                  {danhSach.filter(c => c.trang_thai_hien_tai === overviewTab).length === 0 ? (
                    <p className="text-center text-slate-400 text-[10px] italic py-3 bg-white rounded-lg border border-slate-100">Hiện tại chưa có dữ liệu...</p>
                  ) : (
                    danhSach.filter(c => c.trang_thai_hien_tai === overviewTab).map(c => (
                      <div key={c.id} className={`bg-white p-2 rounded-lg border shadow-sm flex flex-col gap-1.5 text-[10px] slide-up ${overviewTab === 'hen_lai' ? 'border-orange-100' : 'border-emerald-100'}`}>
                        
                        {/* Dòng 1: Tên KH & Thợ phụ trách */}
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800 text-[11px] truncate max-w-[170px]">{c.ten_kh}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black border ${overviewTab === 'hen_lai' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            THỢ: {c.nguoi_phu_trach || 'CHƯA GIAO'}
                          </span>
                        </div>
                        
                        {/* Dòng 2: Mã PE (Copy) | SĐT (Gọi) | Trụ */}
                        <div className="flex justify-between items-center text-slate-500">
                          <div className="flex gap-1.5 items-center">
                            
                            {/* Nút bấm COPY mã PE */}
                            <button 
                              onClick={() => { 
                                navigator.clipboard.writeText(c.ma_pe); 
                                toast.success(`Đã copy mã PE: ${c.ma_pe}`); 
                              }}
                              className="font-mono font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 active:scale-95 px-1.5 py-0.5 rounded transition-all border border-blue-100 flex items-center"
                              title="Bấm để copy mã PE"
                            >
                              <i className="fa-regular fa-copy mr-1 text-[9px]"></i>{c.ma_pe}
                            </button>
                            
                            {/* Nút bấm GỌI ĐIỆN trực tiếp */}
                            {c.so_dien_thoai ? (
                              <a 
                                href={`tel:${c.so_dien_thoai}`} 
                                className="font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:scale-95 px-1.5 py-0.5 rounded transition-all border border-emerald-100 flex items-center"
                                title="Bấm để kích hoạt cuộc gọi"
                              >
                                <i className="fa-solid fa-phone mr-1 text-[9px]"></i>{c.so_dien_thoai}
                              </a>
                            ) : (
                              <span className="font-medium text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 flex items-center">
                                <i className="fa-solid fa-phone-slash mr-1 text-[9px]"></i>Không SĐT
                              </span>
                            )}
                          </div>
                          
                          {/* Số hiệu vị trí vị trí cây ghim trụ bên phải */}
                          <span className="font-mono text-slate-400 font-bold truncate max-w-[100px]" title={c.ma_tru_sach}>
                            <i className="fa-solid fa-location-dot mr-1"></i>{c.ma_tru_sach || 'Cụm lẻ'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        {/* ================= KẾT THÚC KHU VỰC TỔNG QUAN ================= */}
        <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2 mb-2">
          <i className="fa-solid fa-layer-group"></i> Kho Việc 
        </h3>
        
        {Object.keys(khoViec).length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
             <i className="fa-solid fa-mug-hot text-3xl mb-2 text-emerald-400"></i>
             <p className="text-xs font-bold uppercase">Kho việc đã sạch bách!</p>
          </div>
        ) : (
          Object.keys(khoViec).sort((a, b) => {
            const aHasTram = Object.keys(khoViec[a]).some(nhom => nhom.toLowerCase().includes('trạm'));
            const bHasTram = Object.keys(khoViec[b]).some(nhom => nhom.toLowerCase().includes('trạm'));
            if (aHasTram && !bHasTram) return -1;
            if (!aHasTram && bHasTram) return 1;
            return a.localeCompare(b);
          }).map(soGCS => (
            <div key={soGCS} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-3">
              {/* LỚP 1: SỔ GCS */}
              <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex justify-between items-center">
                <span className="text-[11px] font-black text-slate-800 uppercase">SỔ {soGCS}</span>
              </div>
              
              {/* LỚP 2: CÁC TRẠM HOẶC TUYẾN BÊN TRONG SỔ */}
              <div className="p-2 space-y-2">
                {Object.keys(khoViec[soGCS]).sort().map(nhom => {
                  const danhSachCa = khoViec[soGCS][nhom];
                  const isTram = nhom.toLowerCase().includes('trạm');
                  
                  const groupId = `${soGCS}-${nhom}`;
                  const isExpanded = expandedGroups[groupId];

                  return (
                    <div key={nhom} className={`border rounded-lg p-2 relative group transition-all ${isTram ? 'bg-amber-50/40 border-amber-100' : 'bg-blue-50/40 border-blue-100'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <h4 className={`font-bold text-sm ${isTram ? 'text-amber-800' : 'text-blue-800'}`}>
                            <i className={`fa-solid ${isTram ? 'fa-transformer text-amber-500' : 'fa-bolt text-yellow-500'} mr-1`}></i> 
                            {nhom}
                          </h4>
                          <p className="text-[10px] text-slate-500 font-medium">Bao gồm {danhSachCa.length} ca</p>
                        </div>
                        {/* Nút đóng/mở */}
                        <button 
                          onClick={() => toggleGroup(soGCS, nhom)}
                          className={`w-6 h-6 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-blue-600 shadow-sm transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        >
                          <i className="fa-solid fa-chevron-down text-[10px]"></i>
                        </button>
                      </div>

                      {/* KHU VỰC CHI TIẾT (CHỈ HIỆN KHI BẤM NÚT) */}
                      {isExpanded && (
                        <div className={`mb-3 pt-2 border-t border-dashed space-y-1.5 ${isTram ? 'border-amber-200' : 'border-blue-200'}`}>
                          {danhSachCa.map(ca => (
                            <div key={ca.id} className="bg-white p-2 rounded-lg border border-slate-100 shadow-sm text-[10px] slide-up">
                              {/* Dòng 1: Tên Khách hàng */}
                              <div className="font-bold text-slate-800 truncate mb-1.5 text-[11px]">{ca.ten_kh}</div>
                              
                              {/* Dòng 2: Mã PE | SĐT | Trụ */}
                              <div className="flex justify-between items-center text-slate-500">
                                <div className="flex gap-1.5 items-center">
                                  
                                  {/* MÃ PE - Click để Copy */}
                                  <button 
                                    onClick={() => { 
                                      navigator.clipboard.writeText(ca.ma_pe); 
                                      toast.success(`Đã copy: ${ca.ma_pe}`); 
                                    }}
                                    className="font-mono font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 active:scale-95 px-1.5 py-0.5 rounded transition-all border border-blue-100 flex items-center"
                                    title="Nhấn để copy mã PE"
                                  >
                                    <i className="fa-regular fa-copy mr-1 text-[9px]"></i>{ca.ma_pe}
                                  </button>
                                  
                                  {/* SĐT - Click để Gọi */}
                                  {ca.so_dien_thoai ? (
                                    <a 
                                      href={`tel:${ca.so_dien_thoai}`} 
                                      className="font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:scale-95 px-1.5 py-0.5 rounded transition-all border border-emerald-100 flex items-center"
                                      title="Nhấn để gọi điện"
                                    >
                                      <i className="fa-solid fa-phone mr-1 text-[9px]"></i>{ca.so_dien_thoai}
                                    </a>
                                  ) : (
                                    <span className="font-medium text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 flex items-center">
                                      <i className="fa-solid fa-phone-slash mr-1 text-[9px]"></i>Trống
                                    </span>
                                  )}

                                </div>

                                {/* BÊN PHẢI: Mã Trụ */}
                                <span className="font-mono text-blue-600 font-bold truncate max-w-[90px] ml-1" title={ca.ma_tru_sach}>
                                  <i className="fa-solid fa-location-dot mr-1"></i>{ca.ma_tru_sach}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* CÁC NÚT ĐẨY VÀO GIỎ */}
                      <div className={`flex flex-wrap gap-1.5 border-t pt-2 mt-1 ${isTram ? 'border-amber-100' : 'border-blue-100'}`}>
                        <span className="text-[9px] text-slate-400 w-full font-bold uppercase mb-0.5">Đẩy nhanh vào giỏ:</span>
                        {DANH_SACH_THO.map(tho => (
                          <button 
                            key={tho} 
                            onClick={() => handleGiaoCumTru(danhSachCa, tho)}
                            className="bg-white border border-slate-200 hover:border-blue-500 hover:bg-blue-50 active:scale-95 px-2 py-1 rounded shadow-sm text-[10px] font-bold text-slate-600 transition-all flex items-center gap-1 flex-1 justify-center"
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
                      <p className="text-[10px] text-slate-500 mt-0.5 font-medium"><i className="fa-solid fa-layer-group mr-1 text-slate-300"></i>Sổ: {c.so_gcs} | {c.nhom_phan_cong}</p>
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
