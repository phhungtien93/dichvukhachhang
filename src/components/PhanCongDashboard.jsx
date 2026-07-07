import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../supabase';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';

export default function PhanCongDashboard({ profile }) {
  const isAdmin = profile?.role === 'admin';
  const [loading, setLoading] = useState(false);
  const [danhSach, setDanhSach] = useState([]);
  
  // BIẾN MỚI: DANH SÁCH THỢ ĐỘNG LẤY TỪ DATABASE
  const [danhSachTho, setDanhSachTho] = useState([]);
  
  const [danhMucTram, setDanhMucTram] = useState([]);
  const [danhMucTienTo, setDanhMucTienTo] = useState([]); 
  
  const [activeWorkerCart, setActiveWorkerCart] = useState(null);
  const [selectedMicroTasks, setSelectedMicroTasks] = useState([]);

  // ===== MỚI: State quản lý các ca CHƯA GIAO đang được tick chọn (dùng chung cho Tồn Đọng + Kho Việc) =====
  const [selectedUnassignedIds, setSelectedUnassignedIds] = useState([]);
  const toggleUnassigned = (id) => {
    setSelectedUnassignedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const fileInputRef = useRef(null);

  // === CHÈN THÊM ĐOẠN NÀY ===
  const [expandedGroups, setExpandedGroups] = useState({}); // State lưu trạng thái đóng/mở chi tiết
  // === CHÈN THÊM STATE NÀY NGAY DƯỚI expandedGroups ===
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  const [isProgressExpanded, setIsProgressExpanded] = useState(false); // STATE MỚI CHO TIẾN ĐỘ CÁ NHÂN
  const [overviewTab, setOverviewTab] = useState('hen_lai'); // 'hen_lai' hoặc 'da_thu'
  const [isBacklogExpanded, setIsBacklogExpanded] = useState(false);
  const [backlogTab, setBacklogTab] = useState('hen_lai'); // 'hen_lai' hoặc 'chua_xu_ly

  // === STATE CHO TAB LỊCH SỬ ===
  const [mainTab, setMainTab] = useState('phan_cong'); // Điều khiển màn hình: 'phan_cong' hoặc 'lich_su'
  const [searchQuery, setSearchQuery] = useState('');
  const [historyResults, setHistoryResults] = useState([]);
  
  // BIẾN MỚI: DÀNH CHO Ô TRA CỨU NHANH TRỰC TIẾP
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  
  // BIẾN MỚI: DÀNH CHO POPUP TIẾN ĐỘ CÁ NHÂN
  const [selectedWorkerProgress, setSelectedWorkerProgress] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // === CHẾ ĐỘ PHÂN CÔNG KÉP (CÁ NHÂN / THEO NHÓM) ===
  // Khởi tạo state bằng bộ nhớ cục bộ để không bị mất khi F5 hoặc đổi Tab
  const [assignMode, setAssignMode] = useState(() => {
    return localStorage.getItem('mode_phan_cong_docthu') || 'ca_nhan';
  }); 
  const [danhSachNhom, setDanhSachNhom] = useState([]);
  const [activeGroupCart, setActiveGroupCart] = useState(null); // Quản lý giỏ đang mở của nhóm
  const [isCreatingGroup, setIsCreatingGroup] = useState(false); 
  const [editingGroup, setEditingGroup] = useState(null); // BIẾN MỚI: Theo dõi xem có đang sửa nhóm nào không

  // ===== MỚI: STATE CHO POPUP "GIAO VIỆC CHO AI?" =====
  // assignPopup = null khi đóng. Khi mở, chứa: danhSachCa (mảng ca cần giao), type ('ca_nhan' hoặc 'theo_nhom'), title, selectedId
  const [assignPopup, setAssignPopup] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState([]);

  // ================= HỆ THỐNG "TỔ" (PHÂN QUYỀN THEO TỔ) =================
  const [dangTaiCauHinh, setDangTaiCauHinh] = useState(true); // đang tải cờ bật/tắt tính năng, tránh chớp giao diện
  const [batPhanCongTheoTo, setBatPhanCongTheoTo] = useState(false); // cờ toàn hệ thống
  const [danhSachTo, setDanhSachTo] = useState([]); // toàn bộ các Tổ hiện có
  const [toanBoNhanVien, setToanBoNhanVien] = useState([]); // TẤT CẢ nhân viên (không lọc theo Tổ) - dùng cho màn Tổng quan
  const [viewingToId, setViewingToId] = useState(profile?.to_id || null); // Tổ đang xem chi tiết. Tổ trưởng bị khoá cứng theo profile.to_id
  const [dangXemChiTiet, setDangXemChiTiet] = useState(!isAdmin); // Tổ trưởng luôn vào thẳng chi tiết; Admin bắt đầu ở màn tổng quan
  const dangOTongQuan = batPhanCongTheoTo && isAdmin && !dangXemChiTiet;

  const [isCreatingTo, setIsCreatingTo] = useState(false);
  const [editingTo, setEditingTo] = useState(null);
  const [newToName, setNewToName] = useState('');
  const [newToMembers, setNewToMembers] = useState([]);
  const [newToTruongId, setNewToTruongId] = useState(null);

  // HÀM: Lưu Nhóm (Dùng chung cho cả Tạo Mới và Hiệu Chỉnh)
  const handleSaveGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return toast.error('Vui lòng nhập tên nhóm!');
    if (newGroupMembers.length === 0) return toast.error('Vui lòng chọn ít nhất 1 thành viên!');
    
    const chuoiThanhVien = newGroupMembers.join(',');
    const toastId = toast.loading(editingGroup ? 'Đang cập nhật nhóm...' : 'Đang khởi tạo nhóm...');
    
    try {
      if (editingGroup) {
        // LUỒNG 1: HIỆU CHỈNH NHÓM ĐÃ CÓ
        // A. Cập nhật thông tin trên bảng danh_sach_nhom
        const { error: errGroup } = await supabase.from('danh_sach_nhom').update({
          ten_nhom: newGroupName.trim(),
          thanh_vien_ids: chuoiThanhVien
        }).eq('id', editingGroup.id);
        if (errGroup) throw errGroup;

        // B. Cập nhật (Đồng bộ) lại thành viên cho tất cả các ca đang nằm trong giỏ của nhóm này
        await supabase.from('danh_sach_doc_thu').update({
          ten_nhom_phu_trach: newGroupName.trim(),
          ds_id_thanh_vien_nhom: chuoiThanhVien
        }).eq('ten_nhom_phu_trach', editingGroup.ten_nhom).eq('is_active', true);

        toast.success('Cập nhật nhóm thành công!', { id: toastId });
      } else {
        // LUỒNG 2: TẠO NHÓM MỚI (Như cũ)
        const { error: errNew } = await supabase.from('danh_sach_nhom').insert([{
          ten_nhom: newGroupName.trim(),
          thanh_vien_ids: chuoiThanhVien,
          to_id: (batPhanCongTheoTo && viewingToId) ? viewingToId : null
        }]);
        if (errNew) throw errNew;
        toast.success('Tạo nhóm thành công!', { id: toastId });
      }
      
      // Dọn dẹp giao diện sau khi xong
      setIsCreatingGroup(false);
      setEditingGroup(null);
      setNewGroupName('');
      setNewGroupMembers([]);
      fetchAllData(); 
    } catch (error) {
      toast.error('Có lỗi xảy ra khi lưu nhóm!', { id: toastId });
    }
  };

  // HÀM: Xóa Nhóm & Thu hồi việc
  const handleDeleteGroup = async (e, nhomId, tenNhom) => {
    e.stopPropagation(); // Ngăn chặn sự kiện click lan ra ngoài làm mở giỏ việc
    if (!window.confirm(`XÁC NHẬN GIẢI TÁN: ${tenNhom}?\n\nToàn bộ số ca đang nằm trong Giỏ của nhóm này sẽ tự động bị rớt lại ra "Kho Việc Chưa Giao".`)) return;

    const toastId = toast.loading('Đang giải tán nhóm và thu hồi việc...');
    try {
      // 1. Xóa nhóm khỏi Database
      const { error: errGroup } = await supabase.from('danh_sach_nhom').delete().eq('id', nhomId);
      if (errGroup) throw errGroup;

      // 2. Trả lại toàn bộ ca của nhóm này về kho chưa giao
      await supabase.from('danh_sach_doc_thu')
        .update({ 
          ten_nhom_phu_trach: null, 
          ds_id_thanh_vien_nhom: null, 
          ngay_nap_du_lieu: new Date().toISOString() 
        })
        .eq('ten_nhom_phu_trach', tenNhom)
        .eq('is_active', true);

      toast.success(`Đã giải tán ${tenNhom}!`, { id: toastId });
      setActiveGroupCart(null);
      fetchAllData(); // Tải lại dữ liệu để app đồng bộ
    } catch (error) {
      toast.error('Lỗi khi giải tán nhóm!', { id: toastId });
    }
  };

  // ================= QUẢN LÝ TỔ (TẠO / SỬA / XOÁ / GÁN THÀNH VIÊN) =================
  const CAC_TRANG_THAI_DA_XU_LY = ['da_thu', 'da_chuyen_cat_dien', 'da_chuyen_xac_minh', 'da_bao_hen', 'loi_dong_bo_kd'];

  const handleSaveTo = async (e) => {
    e.preventDefault();
    if (!newToName.trim()) return toast.error('Vui lòng nhập tên Tổ!');

    const toastId = toast.loading(editingTo ? 'Đang cập nhật Tổ...' : 'Đang tạo Tổ...');
    try {
      let toId = editingTo?.id;
      if (editingTo) {
        const { error } = await supabase.from('danh_sach_to').update({ ten_to: newToName.trim() }).eq('id', editingTo.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('danh_sach_to').insert([{ ten_to: newToName.trim() }]).select();
        if (error) throw error;
        toId = data[0].id;
      }

      // Thành viên TRƯỚC ĐÂY của Tổ này (nếu đang sửa) so với danh sách MỚI chọn -> xác định ai bị GỠ ra
      const thanhVienTruocDay = editingTo ? toanBoNhanVien.filter(nv => nv.to_id === editingTo.id).map(nv => nv.id) : [];
      const idBiGo = thanhVienTruocDay.filter(id => !newToMembers.includes(id));

      // Gán to_id + la_to_truong cho các thành viên ĐƯỢC CHỌN
      for (const nvId of newToMembers) {
        await supabase.from('user_profiles').update({ to_id: toId, la_to_truong: nvId === newToTruongId }).eq('id', nvId);
      }

      // Thành viên bị GỠ khỏi Tổ: trả to_id về NULL + thu hồi ca CHƯA XỬ LÝ của họ về kho việc chung của Tổ
      if (idBiGo.length > 0) {
        await supabase.from('user_profiles').update({ to_id: null, la_to_truong: false }).in('id', idBiGo);
        await supabase.from('danh_sach_doc_thu')
          .update({ nguoi_phu_trach: null, tho_id: null })
          .in('tho_id', idBiGo)
          .not('trang_thai_hien_tai', 'in', `(${CAC_TRANG_THAI_DA_XU_LY.join(',')})`);
      }

      toast.success(editingTo ? 'Cập nhật Tổ thành công!' : 'Tạo Tổ thành công!', { id: toastId });
      setIsCreatingTo(false);
      setEditingTo(null);
      setNewToName('');
      setNewToMembers([]);
      setNewToTruongId(null);
      fetchOverviewData();
    } catch (error) {
      toast.error('Có lỗi xảy ra khi lưu Tổ!', { id: toastId });
    }
  };

  const handleDeleteTo = async (e, to) => {
    e.stopPropagation();
    const soThanhVien = toanBoNhanVien.filter(nv => nv.to_id === to.id).length;
    if (soThanhVien > 0) {
      return toast.error(`Tổ "${to.ten_to}" vẫn còn ${soThanhVien} thành viên. Vui lòng chuyển hết thành viên sang Tổ khác trước khi xoá!`, { duration: 5000 });
    }
    if (!window.confirm(`Xác nhận xoá Tổ "${to.ten_to}"?`)) return;

    const toastId = toast.loading('Đang xoá Tổ...');
    try {
      const { error } = await supabase.from('danh_sach_to').delete().eq('id', to.id);
      if (error) throw error;
      toast.success('Đã xoá Tổ!', { id: toastId });
      fetchOverviewData();
    } catch (error) {
      toast.error('Tổ này vẫn còn Nhóm hoặc Ca đốc thu gắn vào, không thể xoá!', { id: toastId });
    }
  };

  // HÀM: Giao ca vào Giỏ Nhóm
  const handleGiaoCaChoNhom = async (danhSachCa, nhomObj) => {
    const isoNow = new Date().toISOString();
    const toastId = toast.loading(`Giao ${danhSachCa.length} ca cho ${nhomObj.ten_nhom}...`);

    try {
      const caThuongIds = danhSachCa.filter(c => c.trang_thai_hien_tai !== 'da_bao_hen').map(c => c.id);
      const caBaoHenIds = danhSachCa.filter(c => c.trang_thai_hien_tai === 'da_bao_hen').map(c => c.id);
      // MỚI: ca nào đang đứng "chưa từng thuộc Tổ nào" (to_id NULL) mà đang giao lúc xem 1 Tổ cụ thể -> tự động gắn cứng vào Tổ này luôn
      const idsCanGanTo = (batPhanCongTheoTo && viewingToId) ? danhSachCa.filter(c => !c.to_id).map(c => c.id) : [];

      const payloadBase = {
        ten_nhom_phu_trach: nhomObj.ten_nhom,
        ds_id_thanh_vien_nhom: nhomObj.thanh_vien_ids,
        tho_id: null,           // Xóa dấu vết cá nhân
        nguoi_phu_trach: null,  // Xóa dấu vết cá nhân
        ngay_nap_du_lieu: isoNow
      };

      if (caThuongIds.length > 0) {
        await supabase.from('danh_sach_doc_thu').update(payloadBase).in('id', caThuongIds).eq('is_active', true);
      }
      if (caBaoHenIds.length > 0) {
        await supabase.from('danh_sach_doc_thu').update({ ...payloadBase, trang_thai_hien_tai: 'hen_lai' }).in('id', caBaoHenIds).eq('is_active', true);
      }
      if (idsCanGanTo.length > 0) {
        await supabase.from('danh_sach_doc_thu').update({ to_id: viewingToId }).in('id', idsCanGanTo);
      }

      // MỚI: Cập nhật trực tiếp trong bộ nhớ, KHÔNG gọi fetchAllData() nữa -> phản hồi tức thì
      setDanhSach(prev => prev.map(c => {
        let updated = c;
        if (caThuongIds.includes(c.id)) updated = { ...updated, ...payloadBase };
        if (caBaoHenIds.includes(c.id)) updated = { ...updated, ...payloadBase, trang_thai_hien_tai: 'hen_lai' };
        if (idsCanGanTo.includes(c.id)) updated = { ...updated, to_id: viewingToId };
        return updated;
      }));

      toast.success(`Xong!`, { id: toastId });
    } catch (error) {
      toast.error('Lỗi khi phân công cho nhóm', { id: toastId });
    }
  };

  // HÀM: Chuyển ca lẻ giữa các Nhóm
  const handleChuyenGiaoCaLeNhom = async (nhomNhanObj) => {
    if (selectedMicroTasks.length === 0) return;
    const isoNow = new Date().toISOString();
    const toastId = toast.loading(`Chuyển ca sang ${nhomNhanObj.ten_nhom}...`);
    
    try {
      const caThuongIds = selectedMicroTasks.filter(id => danhSach.find(c => c.id === id)?.trang_thai_hien_tai !== 'da_bao_hen');
      const caBaoHenIds = selectedMicroTasks.filter(id => danhSach.find(c => c.id === id)?.trang_thai_hien_tai === 'da_bao_hen');

      const payloadBase = {
        ten_nhom_phu_trach: nhomNhanObj.ten_nhom,
        ds_id_thanh_vien_nhom: nhomNhanObj.thanh_vien_ids,
        tho_id: null,
        nguoi_phu_trach: null,
        ngay_nap_du_lieu: isoNow
      };

      if (caThuongIds.length > 0) {
        await supabase.from('danh_sach_doc_thu').update(payloadBase).in('id', caThuongIds).eq('is_active', true);
      }
      if (caBaoHenIds.length > 0) {
        await supabase.from('danh_sach_doc_thu').update({ ...payloadBase, trang_thai_hien_tai: 'hen_lai' }).in('id', caBaoHenIds).eq('is_active', true);
      }

      // MỚI: Cập nhật trực tiếp trong bộ nhớ thay vì tải lại từ server
      setDanhSach(prev => prev.map(c => {
        if (caThuongIds.includes(c.id)) return { ...c, ...payloadBase };
        if (caBaoHenIds.includes(c.id)) return { ...c, ...payloadBase, trang_thai_hien_tai: 'hen_lai' };
        return c;
      }));
      
      setSelectedMicroTasks([]);
      toast.success(`Thành công!`, { id: toastId });
    } catch (error) {
      toast.error('Lỗi điều chuyển nhóm', { id: toastId });
    }
  };

  // === HÀM TÌM KIẾM LỊCH SỬ TỪ BẢNG LẠNH ===
  const handleSearchHistory = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    try {
      // Tìm kiếm thông minh bằng ilike: khớp Mã PE, Số điện thoại hoặc Tên KH
      const { data, error } = await supabase
        .from('lich_su_phan_cong')
        .select('*')
        .or(`ma_pe.ilike.%${searchQuery}%,so_dien_thoai.ilike.%${searchQuery}%,ten_kh.ilike.%${searchQuery}%`)
        .order('ngay_nap_du_lieu', { ascending: false })
        .limit(50); // Giới hạn 50 kết quả để chống lag nếu gõ từ khóa quá chung chung

      if (error) throw error;
      setHistoryResults(data || []);
    } catch (error) {
      toast.error('Lỗi khi tra cứu dữ liệu lịch sử!');
    } finally {
      setIsSearching(false);
    }
  };

  const toggleGroup = (soGCS, nhom) => {
    const groupId = `${soGCS}-${nhom}`;
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };
  
  // 1. TẢI DỮ LIỆU TỪ SUPABASE
  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Tổ trưởng (la_to_truong) là người ĐI GIAO việc, không phải người NHẬN việc -> loại khỏi danh sách thợ/thành viên nhóm
      let userQuery = supabase.from('user_profiles').select('id, ho_ten').eq('role', 'user').eq('la_to_truong', false).order('ho_ten');
      let nhomQuery = supabase.from('danh_sach_nhom').select('*').order('ten_nhom');
      let dsQuery = supabase
        .from('danh_sach_doc_thu')
        .select('*')
        .in('trang_thai_hien_tai', ['chua_xu_ly', 'hen_lai', 'da_thu', 'da_chuyen_cat_dien', 'da_chuyen_xac_minh', 'da_bao_hen', 'loi_dong_bo_kd'])
        .eq('is_active', true);

      // KHI ĐANG XEM 1 TỔ CỤ THỂ: lọc nhân viên + nhóm đúng theo Tổ đó.
      // Riêng "Kho Việc" (ca đốc thu) vẫn cho hiện thêm các ca CHƯA từng gắn Tổ nào (to_id NULL - dữ liệu cũ/mới nạp) để Tổ trưởng có thể nhận và tự động gắn Tổ khi giao việc.
      if (batPhanCongTheoTo && viewingToId) {
        userQuery = userQuery.eq('to_id', viewingToId);
        nhomQuery = nhomQuery.eq('to_id', viewingToId);
        dsQuery = dsQuery.or(`to_id.eq.${viewingToId},to_id.is.null`);
      }

      // Gộp cả 5 lượt gọi Supabase để chạy SONG SONG cùng lúc bằng Promise.all
      const [
        { data: userData },
        { data: nhomData },
        { data: tramData },
        { data: tienToData },
        { data: dsData, error: dsErr }
      ] = await Promise.all([
        userQuery,
        nhomQuery,
        supabase.from('danh_muc_tram').select('*'),
        supabase.from('danh_muc_ma_xuat_tuyen').select('*'),
        dsQuery
      ]);

      if (dsErr) throw dsErr;

      setDanhSachTho(userData || []);
      setDanhSachNhom(nhomData || []);
      setDanhMucTram(tramData || []);
      setDanhMucTienTo(tienToData || []);
      setDanhSach(dsData || []);
    } catch (error) {
      toast.error('Lỗi kết nối cơ sở dữ liệu!');
    } finally {
      setLoading(false);
    }
  };

  // HÀM: Tải danh sách Tổ + TOÀN BỘ nhân viên (không lọc) - dùng cho màn Tổng quan Tổ của Admin
  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      const [{ data: toData }, { data: allUsers }] = await Promise.all([
        supabase.from('danh_sach_to').select('*').order('ten_to'),
        supabase.from('user_profiles').select('id, ho_ten, to_id, la_to_truong').eq('role', 'user').order('ho_ten')
      ]);
      setDanhSachTo(toData || []);
      setToanBoNhanVien(allUsers || []);
    } catch (error) {
      toast.error('Lỗi kết nối cơ sở dữ liệu!');
    } finally {
      setLoading(false);
    }
  };

  // Tải cờ bật/tắt tính năng Phân Công Theo Tổ (chạy 1 lần khi mở Tab)
  useEffect(() => {
    supabase.from('cau_hinh_he_thong').select('bat_phan_cong_theo_to').eq('id', 1).single()
      .then(({ data }) => {
        setBatPhanCongTheoTo(data?.bat_phan_cong_theo_to || false);
        setDangTaiCauHinh(false);
      });
  }, []);

  // Điều phối: tuỳ đang ở màn Tổng quan Tổ hay màn Phân Công chi tiết mà tải đúng bộ dữ liệu tương ứng
  useEffect(() => {
    if (dangTaiCauHinh) return;
    if (dangOTongQuan) fetchOverviewData();
    else fetchAllData();
  }, [dangTaiCauHinh, dangOTongQuan, viewingToId]);

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
            nguoi_phu_trach: null,
            to_id: (batPhanCongTheoTo && viewingToId) ? viewingToId : null
          };
        }).filter(item => item.ma_pe);

        if (danhSachNhap.length === 0) return toast.error('File Excel trống!');

        // === TRẠM KIỂM SOÁT KÉP: CHẶN TRÙNG LẶP MÃ PE TRÊN TOÀN HỆ THỐNG ===
        
        // Lấy TOÀN BỘ mã PE đang hoạt động trên hệ thống (Bao gồm cả tồn đọng cũ VÀ ca đã giao cho NV)
        const cacMaPEHienTai = danhSach.map(c => c.ma_pe.toUpperCase().trim());

        // Đối chiếu danh sách Excel mới xem có ông nào dính vào hệ thống không
        const danhSachMaTrùng = danhSachNhap
          .filter(item => cacMaPEHienTai.includes(item.ma_pe.toUpperCase().trim()))
          .map(item => item.ma_pe);

        // Nếu phát hiện dù chỉ 1 mã trùng -> Từ chối và hủy bỏ lệnh nạp toàn bộ file ngay lập tức
        if (danhSachMaTrùng.length > 0) {
          const maTrùngDuyNhất = [...new Set(danhSachMaTrùng)]; // Loại bỏ trùng lặp trong câu thông báo
          
          toast.error(
            `NẠP FILE THẤT BẠI! Phát hiện ${maTrùngDuyNhất.length} mã PE đã tồn tại trên hệ thống (trong kho tồn đọng hoặc đang trên tay Nhân viên). Vui lòng loại bỏ các mã này khỏi file Excel: ${maTrùngDuyNhất.join(', ')}`,
            { duration: 8000, style: { border: '1px solid #f5c6cb', padding: '12px', color: '#721c24' } }
          );
          
          setLoading(false);
          e.target.value = ''; // Giải phóng input file
          return; // Ngắt luồng, tuyệt đối không chèn vào Database
        }

        // ĐỦ ĐIỀU KIỆN SẠCH -> TIẾN HÀNH NẠP FILE
        const toastId = toast.loading(`Đóng điện hệ thống, đang nạp ${danhSachNhap.length} hồ sơ...`);
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

  // === LOGIC PHÂN LOẠI THỜI GIAN VÀ KHO VIỆC (ĐÃ TỐI ƯU HÓA BẰNG USEMEMO CHỐNG LAG) ===
  const todayMidnight = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const { caHomNay, caTonDong } = useMemo(() => {
    return {
      caHomNay: danhSach.filter(c => new Date(c.ngay_nap_du_lieu) >= todayMidnight),
      caTonDong: danhSach.filter(c => new Date(c.ngay_nap_du_lieu) < todayMidnight)
    };
  }, [danhSach, todayMidnight]);

  // 1. Khối TỒN ĐỌNG
  const { tonDongHenLai, tonDongChuaLam, danhSachTonDongHienThi } = useMemo(() => {
    const henLai = caTonDong.filter(c => c.trang_thai_hien_tai === 'hen_lai' || c.trang_thai_hien_tai === 'da_bao_hen');
    const chuaLam = caTonDong.filter(c => c.trang_thai_hien_tai === 'chua_xu_ly');
    return {
      tonDongHenLai: henLai,
      tonDongChuaLam: chuaLam,
      danhSachTonDongHienThi: backlogTab === 'hen_lai' ? henLai : chuaLam
    };
  }, [caTonDong, backlogTab]);

  // 2. Khối TỔNG QUAN
  const { demHenLaiHomNay, demChuaXuHomNay, demDaThu, demDaCat, demXacMinh, demLoiKinhDoanh, tongSoCa, tongDaXuLy, ptTong, danhSachHienThiTongQuan } = useMemo(() => {
    const henLai = caHomNay.filter(c => c.trang_thai_hien_tai === 'hen_lai' || c.trang_thai_hien_tai === 'da_bao_hen');
    const chuaXu = caHomNay.filter(c => c.trang_thai_hien_tai === 'chua_xu_ly');
    const daThu = caHomNay.filter(c => c.trang_thai_hien_tai === 'da_thu');
    const daCat = caHomNay.filter(c => c.trang_thai_hien_tai === 'da_chuyen_cat_dien');
    const xacMinh = caHomNay.filter(c => c.trang_thai_hien_tai === 'da_chuyen_xac_minh');
    const loiKd = caHomNay.filter(c => c.trang_thai_hien_tai === 'loi_dong_bo_kd');

    const tong = henLai.length + chuaXu.length + daThu.length + daCat.length + xacMinh.length + loiKd.length;
    const daXuLy = daThu.length + daCat.length + henLai.length + xacMinh.length + loiKd.length;

    return {
      demHenLaiHomNay: henLai.length, demChuaXuHomNay: chuaXu.length, demDaThu: daThu.length, demDaCat: daCat.length, demXacMinh: xacMinh.length, demLoiKinhDoanh: loiKd.length,
      tongSoCa: tong, tongDaXuLy: daXuLy, ptTong: tong === 0 ? 0 : Math.round((daXuLy / tong) * 100),
      danhSachHienThiTongQuan: caHomNay.filter(c => overviewTab === 'hen_lai' ? (c.trang_thai_hien_tai === 'hen_lai' || c.trang_thai_hien_tai === 'da_bao_hen') : c.trang_thai_hien_tai === overviewTab)
    };
  }, [caHomNay, overviewTab]);

  // === THUẬT TOÁN TRA CỨU NHANH ===
  const quickSearchResults = useMemo(() => {
    if (quickSearchQuery.trim() === '') return [];
    const q = quickSearchQuery.toLowerCase();
    return caHomNay.filter(c => 
      (c.ma_pe && c.ma_pe.toLowerCase().includes(q)) ||
      (c.ten_kh && c.ten_kh.toLowerCase().includes(q)) ||
      (c.so_dien_thoai && c.so_dien_thoai.includes(q))
    ).slice(0, 5);
  }, [caHomNay, quickSearchQuery]);

  // === THUẬT TOÁN TÍNH TIẾN ĐỘ & KHO VIỆC ===
  const { danhSachTienDoTho, danhSachTienDoNhomHienThi, khoViec, gioViec, gioViecNhom, caChuaGiao, caDaGiaoCaNhan, caDaGiaoNhom, tienDoThoMap, tienDoNhomMap } = useMemo(() => {
    // 1. Tiến độ thợ
    const tienDoTho = {};
    danhSachTho.forEach(tho => {
      tienDoTho[tho.id] = { thoObj: tho, tongCa: 0, daXuLy: 0, chiTiet: { hen_lai: 0, da_thu: 0, da_cat: 0, xac_minh: 0, chua_xu_ly: 0 } };
    });

    // 2. Tiến độ nhóm
    const tienDoNhomObj = {};
    danhSachNhom.forEach(nhom => {
      tienDoNhomObj[nhom.ten_nhom] = { nhomObj: nhom, tongCa: 0, daXuLy: 0, chiTiet: { hen_lai: 0, da_thu: 0, da_cat: 0, xac_minh: 0, chua_xu_ly: 0 } };
    });

    caHomNay.forEach(c => {
      // Cập nhật cá nhân
      const thoId = c.tho_id || (danhSachTho.find(t => t.ho_ten === c.nguoi_phu_trach)?.id);
      if (thoId && tienDoTho[thoId]) {
        tienDoTho[thoId].tongCa++;
        if (c.trang_thai_hien_tai !== 'chua_xu_ly') tienDoTho[thoId].daXuLy++;
        if (c.trang_thai_hien_tai === 'hen_lai' || c.trang_thai_hien_tai === 'da_bao_hen') tienDoTho[thoId].chiTiet.hen_lai++;
        else if (c.trang_thai_hien_tai === 'da_thu') tienDoTho[thoId].chiTiet.da_thu++;
        else if (c.trang_thai_hien_tai === 'da_chuyen_cat_dien') tienDoTho[thoId].chiTiet.da_cat++;
        else if (c.trang_thai_hien_tai === 'da_chuyen_xac_minh') tienDoTho[thoId].chiTiet.xac_minh++;
        else if (c.trang_thai_hien_tai === 'chua_xu_ly') tienDoTho[thoId].chiTiet.chua_xu_ly++;
      }

      // Cập nhật nhóm
      const tenNhom = c.ten_nhom_phu_trach;
      if (tenNhom && tienDoNhomObj[tenNhom]) {
        tienDoNhomObj[tenNhom].tongCa++;
        if (c.trang_thai_hien_tai !== 'chua_xu_ly') tienDoNhomObj[tenNhom].daXuLy++;
        if (c.trang_thai_hien_tai === 'hen_lai' || c.trang_thai_hien_tai === 'da_bao_hen') tienDoNhomObj[tenNhom].chiTiet.hen_lai++;
        else if (c.trang_thai_hien_tai === 'da_thu') tienDoNhomObj[tenNhom].chiTiet.da_thu++;
        else if (c.trang_thai_hien_tai === 'da_chuyen_cat_dien') tienDoNhomObj[tenNhom].chiTiet.da_cat++;
        else if (c.trang_thai_hien_tai === 'da_chuyen_xac_minh') tienDoNhomObj[tenNhom].chiTiet.xac_minh++;
        else if (c.trang_thai_hien_tai === 'chua_xu_ly') tienDoNhomObj[tenNhom].chiTiet.chua_xu_ly++;
      }
    });

    const completedStatuses = ['da_thu', 'da_chuyen_cat_dien', 'da_chuyen_xac_minh', 'da_bao_hen', 'loi_dong_bo_kd']; 
    const caChuaGiao = caHomNay.filter(c => !c.nguoi_phu_trach && !c.ten_nhom_phu_trach && !completedStatuses.includes(c.trang_thai_hien_tai));
    const caDaGiaoCaNhan = caHomNay.filter(c => c.nguoi_phu_trach && !completedStatuses.includes(c.trang_thai_hien_tai));
    const caDaGiaoNhom = caHomNay.filter(c => c.ten_nhom_phu_trach && !completedStatuses.includes(c.trang_thai_hien_tai));

    const khoViecObj = {};
    caChuaGiao.forEach(c => {
      const soGCS = c.so_gcs || 'Chưa rõ Sổ';
      const nhom = c.nhom_phan_cong;
      if (!khoViecObj[soGCS]) khoViecObj[soGCS] = {};
      if (!khoViecObj[soGCS][nhom]) khoViecObj[soGCS][nhom] = [];
      khoViecObj[soGCS][nhom].push(c);
    });

    const gioViecObj = {};
    danhSachTho.forEach(tho => gioViecObj[tho.id] = []);
    caDaGiaoCaNhan.forEach(c => {
      const key = c.tho_id || c.nguoi_phu_trach; 
      if (!gioViecObj[key]) gioViecObj[key] = [];
      gioViecObj[key].push(c);
    });

    const gioViecNhomObj = {};
    danhSachNhom.forEach(nhom => gioViecNhomObj[nhom.ten_nhom] = []);
    caDaGiaoNhom.forEach(c => {
      const key = c.ten_nhom_phu_trach;
      if (!gioViecNhomObj[key]) gioViecNhomObj[key] = [];
      gioViecNhomObj[key].push(c);
    });

    return {
      danhSachTienDoTho: Object.values(tienDoTho).filter(t => t.tongCa > 0).sort((a,b) => b.tongCa - a.tongCa),
      danhSachTienDoNhomHienThi: Object.values(tienDoNhomObj).filter(n => n.tongCa > 0).sort((a,b) => b.tongCa - a.tongCa),
      khoViec: khoViecObj, gioViec: gioViecObj, gioViecNhom: gioViecNhomObj, caChuaGiao, caDaGiaoCaNhan, caDaGiaoNhom,
      // Xuất thêm 2 bảng đầy đủ (kể cả người 0 ca) để Popup Giao Việc dùng
      tienDoThoMap: tienDoTho,
      tienDoNhomMap: tienDoNhomObj
    };
  }, [caHomNay, danhSachTho, danhSachNhom]);

  // ===== 2 hàm điều khiển Popup "Giao việc cho ai?" =====

  // Mở popup: nhận vào danh sách ca cần giao + loại (cá nhân/nhóm) + tiêu đề hiển thị
  const openAssignPopup = (danhSachCa, type, title) => {
    setAssignPopup({ danhSachCa, type, title, selectedId: null });
  };

  // Khi bấm "Xác nhận giao cho..." trong popup
  const handleConfirmAssignPopup = () => {
    if (!assignPopup || !assignPopup.selectedId) return;

    if (assignPopup.type === 'ca_nhan') {
      const thoObj = danhSachTho.find(t => t.id === assignPopup.selectedId);
      if (thoObj) handleGiaoCumTru(assignPopup.danhSachCa, thoObj);
    } else {
      const nhomObj = danhSachNhom.find(n => n.id === assignPopup.selectedId);
      if (nhomObj) handleGiaoCaChoNhom(assignPopup.danhSachCa, nhomObj);
    }
    setSelectedUnassignedIds([]); // MỚI: xoá tick chọn sau khi đã giao xong
    setAssignPopup(null); // đóng popup sau khi giao xong
  };

  // 4. CHỨC NĂNG CHIA CA (Nhận truyền vào là Object Thợ thay vì tên)
  const handleGiaoCumTru = async (danhSachCa, thoObj) => {
    const isoNow = new Date().toISOString();
    const toastId = toast.loading(`Giao ${danhSachCa.length} ca cho ${thoObj.ho_ten}...`);
    
    try {
      const caThuongIds = danhSachCa.filter(c => c.trang_thai_hien_tai !== 'da_bao_hen').map(c => c.id);
      const caBaoHenIds = danhSachCa.filter(c => c.trang_thai_hien_tai === 'da_bao_hen').map(c => c.id);
      const idsCanGanTo = (batPhanCongTheoTo && viewingToId) ? danhSachCa.filter(c => !c.to_id).map(c => c.id) : [];

      if (caThuongIds.length > 0) {
        await supabase.from('danh_sach_doc_thu').update({ nguoi_phu_trach: thoObj.ho_ten, tho_id: thoObj.id, ngay_nap_du_lieu: isoNow }).in('id', caThuongIds).eq('is_active', true);
      }
      if (caBaoHenIds.length > 0) {
        await supabase.from('danh_sach_doc_thu').update({ nguoi_phu_trach: thoObj.ho_ten, tho_id: thoObj.id, ngay_nap_du_lieu: isoNow, trang_thai_hien_tai: 'hen_lai' }).in('id', caBaoHenIds).eq('is_active', true);
      }
      if (idsCanGanTo.length > 0) {
        await supabase.from('danh_sach_doc_thu').update({ to_id: viewingToId }).in('id', idsCanGanTo);
      }

      setDanhSach(prev => prev.map(c => {
        let updated = c;
        if (caThuongIds.includes(c.id)) updated = { ...updated, nguoi_phu_trach: thoObj.ho_ten, tho_id: thoObj.id, ngay_nap_du_lieu: isoNow };
        if (caBaoHenIds.includes(c.id)) updated = { ...updated, nguoi_phu_trach: thoObj.ho_ten, tho_id: thoObj.id, ngay_nap_du_lieu: isoNow, trang_thai_hien_tai: 'hen_lai' };
        if (idsCanGanTo.includes(c.id)) updated = { ...updated, to_id: viewingToId };
        return updated;
      }));
      toast.success(`Xong!`, { id: toastId });
    } catch (error) {
      toast.error('Lỗi khi phân công', { id: toastId });
    }
  };

  const toggleMicroTask = (id) => setSelectedMicroTasks(prev => prev.includes(id) ? prev.filter(tId => tId !== id) : [...prev, id]);

  const handleChuyenGiaoCaLe = async (thoNhanObj) => {
    if (selectedMicroTasks.length === 0) return;
    const isoNow = new Date().toISOString();
    const toastId = toast.loading(`Chuyển ca sang ${thoNhanObj.ho_ten}...`);
    
    try {
      const caThuongIds = selectedMicroTasks.filter(id => danhSach.find(c => c.id === id)?.trang_thai_hien_tai !== 'da_bao_hen');
      const caBaoHenIds = selectedMicroTasks.filter(id => danhSach.find(c => c.id === id)?.trang_thai_hien_tai === 'da_bao_hen');

      if (caThuongIds.length > 0) {
        await supabase.from('danh_sach_doc_thu').update({ nguoi_phu_trach: thoNhanObj.ho_ten, tho_id: thoNhanObj.id, ngay_nap_du_lieu: isoNow }).in('id', caThuongIds).eq('is_active', true);
      }
      if (caBaoHenIds.length > 0) {
        await supabase.from('danh_sach_doc_thu').update({ nguoi_phu_trach: thoNhanObj.ho_ten, tho_id: thoNhanObj.id, ngay_nap_du_lieu: isoNow, trang_thai_hien_tai: 'hen_lai' }).in('id', caBaoHenIds).eq('is_active', true);
      }
      
      setDanhSach(prev => prev.map(c => {
        if (caThuongIds.includes(c.id)) return { ...c, nguoi_phu_trach: thoNhanObj.ho_ten, tho_id: thoNhanObj.id, ngay_nap_du_lieu: isoNow };
        if (caBaoHenIds.includes(c.id)) return { ...c, nguoi_phu_trach: thoNhanObj.ho_ten, tho_id: thoNhanObj.id, ngay_nap_du_lieu: isoNow, trang_thai_hien_tai: 'hen_lai' };
        return c;
      }));
      setSelectedMicroTasks([]);
      toast.success(`Thành công!`, { id: toastId });
    } catch (error) {
      toast.error('Lỗi điều chuyển', { id: toastId });
    }
  };

  // 5. ĐẶC QUYỀN ĐỘI TRƯỞNG (ĐÃ TÁCH RA THÀNH HÀM ĐỘC LẬP CHUẨN CÚ PHÁP)
  const handleDoiTruongXuLyTonDong = async (ca, hanhDong) => {
    const tenHanhDong = hanhDong === 'da_thu' ? 'ĐÃ THU' : 'CẮT ĐIỆN';
    if (!window.confirm(`Xác nhận chốt ca này thành: ${tenHanhDong}?`)) return;

    const toastId = toast.loading(`Đội trưởng đang xử lý: ${tenHanhDong}...`);
    try {
      if (hanhDong === 'da_chuyen_cat_dien') {
        const { data: checkKhList } = await supabase.from('customers').select('id, trang_thai').eq('ma_pe', ca.ma_pe).limit(1);
        const checkKh = checkKhList && checkKhList.length > 0 ? checkKhList[0] : null;
        
        const blockStatuses = ['cho_xac_minh', 'cho_cat_dien', 'da_cat'];
        
        if (checkKh && blockStatuses.includes(checkKh.trang_thai)) {
          await supabase.from('danh_sach_doc_thu').update({ trang_thai_hien_tai: 'loi_dong_bo_kd', nguoi_phu_trach: 'ĐỘI TRƯỞNG' }).eq('id', ca.id);
          toast('⚠️ Khách đã có lệnh bên Điều Hành. Chuyển sang Lỗi KD!', { id: toastId, style: { background: '#fff3cd', color: '#856404', border: '1px solid #ffeeba' } });
          fetchAllData();
          return;
        }

        const payloadCustomer = {
          ma_pe: ca.ma_pe,
          ten_kh: ca.ten_kh,
          dia_chi: ca.dia_chi,
          so_dien_thoai: ca.so_dien_thoai || '',
          so_tien_no: ca.so_tien || 0,
          ly_do_ngung: 'no_cuoc',
          trang_thai: 'da_cat', 
          ngay_cat: new Date().toISOString(),
          ghi_chu: `(Đội trưởng ép lệnh trực tiếp từ Tồn Đọng)`
        };

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
            hanh_dong: 'Đội trưởng ép lệnh',
            noi_dung: `Đội trưởng đã xác minh khách Hẹn Lại KHÔNG ĐÓNG. Yêu cầu CẮT ĐIỆN!`
          }]);
        }
      }

      await supabase.from('danh_sach_doc_thu')
        .update({ 
          trang_thai_hien_tai: hanhDong, 
          nguoi_phu_trach: 'ĐỘI TRƯỞNG', 
          ngay_nap_du_lieu: new Date().toISOString() 
        })
        .eq('id', ca.id);

      toast.success(`Đã chốt: ${tenHanhDong}`, { id: toastId });
      fetchAllData();
    } catch (error) {
      toast.error('Lỗi khi xử lý!', { id: toastId });
    }
  };

  // ================= MÀN CHỜ TẢI CẤU HÌNH (TRÁNH CHỚP GIAO DIỆN LÚC MỞ TAB) =================
  if (dangTaiCauHinh) {
    return (
      <div className="w-full max-w-md mx-auto bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center text-blue-500">
          <i className="fa-solid fa-circle-notch animate-spin text-4xl mb-3"></i>
          <p className="font-bold text-xs animate-pulse">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  // ================= MÀN TỔNG QUAN CÁC TỔ (CHỈ ADMIN, KHI TÍNH NĂNG PHÂN CÔNG THEO TỔ ĐANG BẬT) =================
  if (dangOTongQuan) {
    return (
      <div className="w-full max-w-md mx-auto bg-slate-50 min-h-screen pb-24 fade-in relative">
        <div className="bg-white px-4 py-3 border-b border-slate-200 sticky top-0 z-30 shadow-sm flex justify-between items-center">
          <div>
            <h2 className="font-black text-lg text-slate-800 tracking-tight">TỔNG QUAN <span className="text-purple-600">CÁC TỔ</span></h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase">{danhSachTo.length} Tổ đang hoạt động</p>
          </div>
          <button
            onClick={() => { setEditingTo(null); setNewToName(''); setNewToMembers([]); setNewToTruongId(null); setIsCreatingTo(true); }}
            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow-sm active:scale-95 transition-all"
          >
            <i className="fa-solid fa-plus mr-1"></i> Tạo Tổ
          </button>
        </div>

        <div className="p-3 space-y-3">
          {loading ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center text-slate-400">
              <i className="fa-solid fa-circle-notch animate-spin text-2xl"></i>
            </div>
          ) : danhSachTo.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
              <i className="fa-solid fa-people-roof text-3xl mb-2"></i>
              <p className="text-xs font-bold uppercase">Chưa có Tổ nào được lập</p>
              <p className="text-[10px] mt-1">Bấm "Tạo Tổ" ở trên để bắt đầu chia nhân sự theo Tổ.</p>
            </div>
          ) : (
            danhSachTo.map(to => {
              const thanhVienCuaTo = toanBoNhanVien.filter(nv => nv.to_id === to.id);
              const toTruong = thanhVienCuaTo.find(nv => nv.la_to_truong);
              return (
                <div key={to.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-black text-slate-800 text-sm">{to.ten_to}</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {thanhVienCuaTo.length} nhân viên{toTruong ? ` · Tổ trưởng: ${toTruong.ho_ten}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setEditingTo(to);
                          setNewToName(to.ten_to);
                          setNewToMembers(thanhVienCuaTo.map(nv => nv.id));
                          setNewToTruongId(toTruong?.id || null);
                          setIsCreatingTo(true);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-blue-500 hover:text-white transition-colors"
                        title="Sửa Tổ / Quản lý thành viên"
                      >
                        <i className="fa-solid fa-pen text-[10px]"></i>
                      </button>
                      <button
                        onClick={(e) => handleDeleteTo(e, to)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-rose-500 hover:text-white transition-colors"
                        title="Xoá Tổ"
                      >
                        <i className="fa-solid fa-trash-can text-[10px]"></i>
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => { setViewingToId(to.id); setDangXemChiTiet(true); }}
                    className="w-full py-2 bg-purple-50 hover:bg-purple-600 hover:text-white text-purple-700 rounded-lg text-xs font-black transition-colors"
                  >
                    Xem chi tiết <i className="fa-solid fa-arrow-right ml-1"></i>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* ================= MODAL TẠO / SỬA TỔ ================= */}
        {isCreatingTo && (
          <div className="fixed inset-0 bg-slate-900/60 z-[120] flex items-center justify-center p-4 fade-in backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl slide-up max-h-[90vh] flex flex-col">
              <div className="p-4 border-b border-slate-100 bg-purple-50 flex justify-between items-center shrink-0">
                <h3 className="font-black text-purple-800 uppercase flex items-center gap-2 text-sm">
                  <i className={`fa-solid ${editingTo ? 'fa-pen-to-square' : 'fa-people-roof'}`}></i>
                  {editingTo ? 'Hiệu Chỉnh Tổ' : 'Tạo Tổ Mới'}
                </h3>
                <button onClick={() => { setIsCreatingTo(false); setEditingTo(null); setNewToName(''); setNewToMembers([]); setNewToTruongId(null); }} className="text-slate-400 hover:text-rose-500 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm transition-colors">
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              <form onSubmit={handleSaveTo} className="p-4 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Tên Tổ</label>
                  <input
                    type="text"
                    value={newToName}
                    onChange={(e) => setNewToName(e.target.value)}
                    placeholder="Ví dụ: Tổ 1, Tổ Khu Vực A..."
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Chọn thành viên (Đã chọn: {newToMembers.length})</label>
                  <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto pr-1 no-scrollbar">
                    {(() => {
                      // Chỉ hiện nhân viên CHƯA thuộc Tổ nào khác + nhân viên đang thuộc chính Tổ này (nếu đang sửa)
                      const nvHienThi = toanBoNhanVien.filter(nv => !nv.to_id || nv.to_id === editingTo?.id);
                      if (nvHienThi.length === 0) return <div className="text-center text-xs text-rose-500 font-bold p-3 bg-rose-50 rounded-lg">Không còn nhân viên nào rảnh (chưa thuộc Tổ khác)!</div>;

                      return nvHienThi.map(nv => {
                        const isSelected = newToMembers.includes(nv.id);
                        return (
                          <div key={nv.id} className={`flex items-center justify-between gap-2 p-2.5 border rounded-xl transition-colors select-none ${isSelected ? 'bg-purple-50 border-purple-500 ring-1 ring-purple-500' : 'bg-white border-slate-200'}`}>
                            <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-300'}`}>
                                {isSelected && <i className="fa-solid fa-check text-[10px]"></i>}
                              </div>
                              <span className={`text-[11px] font-bold truncate ${isSelected ? 'text-purple-700' : 'text-slate-600'}`}>{nv.ho_ten}</span>
                              <input type="checkbox" className="hidden" checked={isSelected} onChange={(e) => {
                                if (e.target.checked) {
                                  setNewToMembers([...newToMembers, nv.id]);
                                } else {
                                  setNewToMembers(newToMembers.filter(id => id !== nv.id));
                                  if (newToTruongId === nv.id) setNewToTruongId(null);
                                }
                              }} />
                            </label>
                            {isSelected && (
                              <button
                                type="button"
                                onClick={() => setNewToTruongId(newToTruongId === nv.id ? null : nv.id)}
                                className={`shrink-0 text-[9px] font-black px-2 py-1 rounded-full uppercase transition-colors ${newToTruongId === nv.id ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-amber-100 hover:text-amber-600'}`}
                              >
                                <i className="fa-solid fa-star mr-1"></i>Tổ trưởng
                              </button>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                <div className="pt-2">
                  <button type="submit" className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl text-sm shadow-md active:scale-95 transition-all uppercase tracking-wider">
                    {editingTo ? 'CẬP NHẬT TỔ' : 'KHỞI TẠO TỔ'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto bg-slate-50 min-h-screen pb-24 flex flex-col fade-in relative">
      <div className="bg-white px-4 py-3 border-b border-slate-200 sticky top-0 z-30 shadow-sm flex justify-between items-center">
        <div className="flex flex-col gap-1.5">
          {/* NÚT QUAY LẠI TỔNG QUAN TỔ - CHỈ ADMIN, KHI TÍNH NĂNG THEO TỔ ĐANG BẬT VÀ ĐÃ VÀO XEM 1 TỔ CỤ THỂ */}
          {batPhanCongTheoTo && isAdmin && dangXemChiTiet && (
            <button
              onClick={() => { setDangXemChiTiet(false); }}
              className="flex items-center gap-1.5 text-[10px] font-black text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg px-2 py-1 w-max transition-colors"
            >
              <i className="fa-solid fa-arrow-left"></i> Quay lại tổng quan · {danhSachTo.find(t => t.id === viewingToId)?.ten_to || 'Tổ'}
            </button>
          )}
          {/* CÔNG TẮC CHUYỂN ĐỔI NHƯ MỘT TAB CHÍNH */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg w-max shadow-inner border border-slate-200">
            <button 
              onClick={() => { 
                setAssignMode('ca_nhan'); 
                localStorage.setItem('mode_phan_cong_docthu', 'ca_nhan'); // Lưu vào bộ nhớ máy
                setActiveGroupCart(null); 
                setSelectedMicroTasks([]); 
              }}
              className={`px-3 py-1 text-[9px] font-black uppercase rounded-md transition-all ${assignMode === 'ca_nhan' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Cá nhân
            </button>
            <button 
              onClick={() => { 
                setAssignMode('theo_nhom'); 
                localStorage.setItem('mode_phan_cong_docthu', 'theo_nhom'); // Lưu vào bộ nhớ máy
                setActiveWorkerCart(null); 
                setSelectedMicroTasks([]); 
              }}
              className={`px-3 py-1 text-[9px] font-black uppercase rounded-md transition-all ${assignMode === 'theo_nhom' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Theo Nhóm
            </button>
          </div>

          <h2 className="font-black text-lg text-slate-800 tracking-tight mt-0.5">ĐIỀU PHỐI <span className={assignMode === 'theo_nhom' ? "text-purple-600" : "text-blue-600"}>ĐỐC THU</span></h2>
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
      <div className={`flex-1 p-3 space-y-3 overflow-y-auto ${selectedUnassignedIds.length > 0 ? 'pb-16' : ''}`}>
        
        {/* === THANH ĐIỀU HƯỚNG MÀN HÌNH CHÍNH === */}
        <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex shrink-0">
           <button 
             onClick={() => setMainTab('phan_cong')} 
             className={`flex-1 py-2.5 text-[11px] font-black rounded-lg transition-all flex justify-center items-center gap-1.5 ${mainTab === 'phan_cong' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
           >
             <i className="fa-solid fa-list-check"></i> ĐIỀU PHỐI CA
           </button>
           <button 
             onClick={() => setMainTab('lich_su')} 
             className={`flex-1 py-2.5 text-[11px] font-black rounded-lg transition-all flex justify-center items-center gap-1.5 ${mainTab === 'lich_su' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
           >
             <i className="fa-solid fa-clock-rotate-left"></i> LỊCH SỬ PHÂN CÔNG
           </button>
        </div>

        {/* Thanh "Giao việc đã chọn" đã chuyển xuống ngoài vùng cuộn, đặt ngay trên Giỏ hàng (xem phía dưới) */}

        {/* NẾU ĐANG Ở TAB LỊCH SỬ -> HIỂN THỊ GIAO DIỆN TÌM KIẾM */}
        {mainTab === 'lich_su' && (
          <div className="fade-in space-y-3 pb-4">
            {/* Ô nhập từ khóa */}
            <form onSubmit={handleSearchHistory} className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <i className="fa-solid fa-magnifying-glass"></i>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Nhập Mã PE, SĐT hoặc Tên..."
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>
              <button 
                type="submit" 
                disabled={isSearching}
                className="bg-blue-600 text-white px-4 rounded-xl font-bold text-xs shadow-sm active:scale-95 transition-all flex items-center justify-center shrink-0"
              >
                {isSearching ? <i className="fa-solid fa-spinner animate-spin"></i> : 'TÌM'}
              </button>
            </form>

            {/* Bảng hiển thị kết quả */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[300px]">
              <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-600 uppercase">Kết quả tra cứu ({historyResults.length})</span>
              </div>
              
              <div className="p-2 space-y-2">
                {!hasSearched ? (
                  <div className="text-center py-10 text-slate-400">
                    <i className="fa-solid fa-folder-open text-4xl mb-2 opacity-50"></i>
                    <p className="text-xs font-medium">Nhập thông tin để quét dữ liệu cũ</p>
                  </div>
                ) : isSearching ? (
                  <div className="text-center py-10 text-blue-500">
                    <i className="fa-solid fa-circle-notch animate-spin text-3xl mb-2"></i>
                    <p className="text-xs font-bold animate-pulse">Đang rà soát kho lưu trữ...</p>
                  </div>
                ) : historyResults.length === 0 ? (
                  <div className="text-center py-10 text-rose-500">
                    <i className="fa-solid fa-ghost text-4xl mb-2 opacity-50"></i>
                    <p className="text-xs font-bold">Không tìm thấy hồ sơ nào khớp!</p>
                  </div>
                ) : (
                  historyResults.map(ca => (
                    <div key={ca.id} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-1.5 slide-up">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-slate-800 text-[11px]">{ca.ten_kh}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black border uppercase tracking-wider ${
                          ca.trang_thai_hien_tai === 'da_thu' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          ca.trang_thai_hien_tai === 'da_chuyen_cat_dien' ? 'bg-red-50 text-red-700 border-red-200' :
                          ca.trang_thai_hien_tai === 'da_chuyen_xac_minh' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          ca.trang_thai_hien_tai === 'loi_dong_bo_kd' ? 'bg-slate-700 text-white border-slate-800' :
                          'bg-orange-50 text-orange-700 border-orange-200'
                        }`}>
                          {ca.trang_thai_hien_tai === 'da_thu' ? 'Đã thu tiền' :
                           ca.trang_thai_hien_tai === 'da_chuyen_cat_dien' ? 'Đã cắt điện' :
                           ca.trang_thai_hien_tai === 'da_chuyen_xac_minh' ? 'Xác minh Bill' :
                           ca.trang_thai_hien_tai === 'loi_dong_bo_kd' ? 'Lỗi Kinh Doanh' :
                           'Khách hẹn lại'}
                        </span>
                      </div>
                      
                      <div className="flex gap-2 items-center mt-0.5">
                        <span className="font-mono font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 text-[10px]">{ca.ma_pe}</span>
                        <span className="font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 text-[10px]"><i className="fa-solid fa-phone mr-1"></i>{ca.so_dien_thoai || 'Trống'}</span>
                      </div>

                      <div className="flex justify-between items-end mt-1 border-t border-slate-100 pt-1.5">
                        <div>
                          <p className="text-[9px] text-slate-500 font-bold"><i className="fa-solid fa-hard-hat mr-1"></i>Nv xử lý: <span className="text-blue-700">{ca.nguoi_phu_trach || 'Chưa rõ'}</span></p>
                          <p className="text-[9px] text-slate-500 font-bold mt-0.5"><i className="fa-solid fa-calendar-check mr-1"></i>Cập nhật: {new Date(ca.ngay_nap_du_lieu).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                        </div>
                        <span className="font-mono text-slate-400 font-bold text-[9px]"><i className="fa-solid fa-location-dot mr-1"></i>{ca.ma_tru_sach}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* NẾU ĐANG Ở TAB ĐIỀU PHỐI -> HIỂN THỊ LUỒNG LÀM VIỆC CHÍNH */}
        {mainTab === 'phan_cong' && (
          <div className="fade-in space-y-3">
            
            {/* === Ô TRA CỨU NHANH (LIVE SEARCH) ĐẶT TRÊN CÙNG === */}
            <div className="relative z-10">
              <div className="relative flex items-center">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-blue-500">
                  <i className="fa-solid fa-magnifying-glass"></i>
                </div>
                <input
                  type="text"
                  value={quickSearchQuery}
                  onChange={(e) => setQuickSearchQuery(e.target.value)}
                  placeholder="Tra cứu nhanh mã PE, Tên KH, SĐT hôm nay..."
                  className="w-full pl-9 pr-10 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-semibold text-slate-700 placeholder-blue-400/70"
                />
                {quickSearchQuery && (
                  <button onClick={() => setQuickSearchQuery('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 active:scale-95">
                    <i className="fa-solid fa-circle-xmark text-lg"></i>
                  </button>
                )}
              </div>

              {/* KHUNG POPUP HIỂN THỊ KẾT QUẢ TÌM KIẾM */}
              {quickSearchQuery.trim() !== '' && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden fade-in">
                  <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase">Kết quả theo dõi hôm nay</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto p-1.5 space-y-1.5">
                    {quickSearchResults.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 text-xs italic">Không tìm thấy ca nào khớp trong ngày hôm nay!</div>
                    ) : (
                      quickSearchResults.map(ca => (
                        <div key={ca.id} className="p-2.5 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                          <div className="flex justify-between items-start mb-1.5">
                            <div className="font-bold text-slate-800 text-[11px] truncate pr-2">{ca.ten_kh}</div>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black border uppercase tracking-wider shrink-0 ${
                              ca.trang_thai_hien_tai === 'da_thu' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              ca.trang_thai_hien_tai === 'da_chuyen_cat_dien' ? 'bg-red-50 text-red-700 border-red-200' :
                              ca.trang_thai_hien_tai === 'da_chuyen_xac_minh' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              ca.trang_thai_hien_tai === 'chua_xu_ly' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              {ca.trang_thai_hien_tai === 'da_thu' ? 'Đã thu' :
                               ca.trang_thai_hien_tai === 'da_chuyen_cat_dien' ? 'Đã cắt' :
                               ca.trang_thai_hien_tai === 'da_chuyen_xac_minh' ? 'Đợi XM' :
                               ca.trang_thai_hien_tai === 'chua_xu_ly' ? 'Chưa làm' : 'Khác'}
                            </span>
                          </div>
                          <div className="flex gap-2 items-center text-[10px]">
                            <span className="font-mono font-bold text-blue-600">{ca.ma_pe}</span>
                            <span className="text-slate-300">|</span>
                            {/* Dòng hiển thị TÊN THỢ PHỤ TRÁCH */}
                            <span className={`font-bold ${ca.nguoi_phu_trach ? 'text-emerald-600' : 'text-slate-400'}`}>
                              <i className={`fa-solid ${ca.nguoi_phu_trach ? 'fa-hard-hat' : 'fa-box-open'} mr-1`}></i> 
                              {ca.nguoi_phu_trach ? `Nv: ${ca.nguoi_phu_trach}` : 'Đang trong kho (Chưa giao)'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ================= BẮT ĐẦU KHU VỰC TIẾN ĐỘ (TỰ ĐỘNG CHUYỂN ĐỔI THEO TAB) ================= */}
            {loading ? (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 mb-2 shrink-0 animate-pulse">
                <div className="flex justify-between items-center mb-3">
                  <div className="h-4 bg-slate-200 rounded w-1/3"></div>
                  <div className="h-4 bg-slate-200 rounded-full w-12"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-10 bg-slate-100 rounded-lg w-full"></div>
                  <div className="h-10 bg-slate-100 rounded-lg w-full"></div>
                </div>
              </div>
            ) : (
              <>
                {/* 1. KHI Ở TAB CÁ NHÂN */}
                {assignMode === 'ca_nhan' && danhSachTienDoTho.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-2 fade-in shrink-0">
                    <button 
                      onClick={() => setIsProgressExpanded(!isProgressExpanded)}
                      className="w-full px-3 py-2.5 bg-blue-50 hover:bg-blue-100 flex justify-between items-center transition-colors"
                    >
                      <h3 className="text-[11px] font-black text-blue-800 uppercase tracking-wider flex items-center gap-2">
                        <i className="fa-solid fa-list-check text-blue-500"></i> Tiến độ cá nhân
                      </h3>
                      <div className="flex items-center gap-3">
                        <span className="bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full text-[9px] font-black shadow-sm">
                          {danhSachTienDoTho.length} Nhân viên
                        </span>
                        <i className={`fa-solid fa-chevron-down text-blue-500 transition-transform ${isProgressExpanded ? 'rotate-180' : ''}`}></i>
                      </div>
                    </button>

                    {isProgressExpanded && (
                      <div className="max-h-52 overflow-y-auto no-scrollbar p-2 space-y-1.5 bg-slate-50/30 border-t border-slate-200">
                        {danhSachTienDoTho.map(tienDo => {
                          const pt = tienDo.tongCa === 0 ? 0 : Math.round((tienDo.daXuLy / tienDo.tongCa) * 100);
                          return (
                            <div key={tienDo.thoObj.id} onClick={() => setSelectedWorkerProgress(tienDo)} className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center gap-3 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all active:scale-[0.98] shadow-sm">
                              <div className="w-[35%] truncate"><span className="font-bold text-[11px] text-slate-700">{tienDo.thoObj.ho_ten}</span></div>
                              <div className="flex-1 flex flex-col justify-center">
                                <div className="flex justify-between items-center text-[9px] mb-1">
                                  <span className="font-bold text-slate-500 uppercase tracking-tight">{tienDo.daXuLy}/{tienDo.tongCa} ca</span>
                                  <span className={`font-black ${pt === 100 ? 'text-emerald-600' : 'text-blue-600'}`}>{pt}%</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden shadow-inner">
                                  <div className={`h-full rounded-full transition-all duration-700 ${pt === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pt}%` }}></div>
                                </div>
                              </div>
                              <i className="fa-solid fa-chevron-right text-slate-300 text-[10px] shrink-0 pl-1"></i>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. KHI Ở TAB THEO NHÓM */}
                {assignMode === 'theo_nhom' && danhSachTienDoNhomHienThi.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-2 fade-in shrink-0">
                    <button 
                      onClick={() => setIsProgressExpanded(!isProgressExpanded)}
                      className="w-full px-3 py-2.5 bg-purple-50 hover:bg-purple-100 flex justify-between items-center transition-colors"
                    >
                      <h3 className="text-[11px] font-black text-purple-800 uppercase tracking-wider flex items-center gap-2">
                        <i className="fa-solid fa-people-group text-purple-500"></i> Tiến độ theo Nhóm
                      </h3>
                      <div className="flex items-center gap-3">
                        <span className="bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full text-[9px] font-black shadow-sm">
                          {danhSachTienDoNhomHienThi.length} Nhóm
                        </span>
                        <i className={`fa-solid fa-chevron-down text-purple-500 transition-transform ${isProgressExpanded ? 'rotate-180' : ''}`}></i>
                      </div>
                    </button>

                    {isProgressExpanded && (
                      <div className="max-h-52 overflow-y-auto no-scrollbar p-2 space-y-1.5 bg-slate-50/30 border-t border-slate-200">
                        {danhSachTienDoNhomHienThi.map(tienDo => {
                          const pt = tienDo.tongCa === 0 ? 0 : Math.round((tienDo.daXuLy / tienDo.tongCa) * 100);
                          return (
                            <div key={tienDo.nhomObj.id} onClick={() => {
                                // Tái sử dụng Popup cá nhân để hiển thị số liệu cho nhóm cực tiện lợi
                                setSelectedWorkerProgress({ thoObj: { ho_ten: tienDo.nhomObj.ten_nhom }, chiTiet: tienDo.chiTiet });
                            }} className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center gap-3 cursor-pointer hover:bg-purple-50 hover:border-purple-300 transition-all active:scale-[0.98] shadow-sm">
                              <div className="w-[35%] truncate"><span className="font-bold text-[11px] text-slate-700">{tienDo.nhomObj.ten_nhom}</span></div>
                              <div className="flex-1 flex flex-col justify-center">
                                <div className="flex justify-between items-center text-[9px] mb-1">
                                  <span className="font-bold text-slate-500 uppercase tracking-tight">{tienDo.daXuLy}/{tienDo.tongCa} ca</span>
                                  <span className={`font-black ${pt === 100 ? 'text-emerald-600' : 'text-purple-600'}`}>{pt}%</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden shadow-inner">
                                  <div className={`h-full rounded-full transition-all duration-700 ${pt === 100 ? 'bg-emerald-500' : 'bg-purple-500'}`} style={{ width: `${pt}%` }}></div>
                                </div>
                              </div>
                              <i className="fa-solid fa-chevron-right text-slate-300 text-[10px] shrink-0 pl-1"></i>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
                
                {/* 3. THÔNG BÁO GỌN GÀNG KHI CHƯA GIAO VIỆC CHO AI */}
                {((assignMode === 'ca_nhan' && danhSachTienDoTho.length === 0) || (assignMode === 'theo_nhom' && danhSachTienDoNhomHienThi.length === 0)) && (
                   <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 mb-2 shrink-0 text-center text-slate-400 text-[10px] italic">
                     Chưa có {assignMode === 'ca_nhan' ? 'nhân viên' : 'tổ/nhóm'} nào được phân việc.
                   </div>
                )}
              </>
            )}

            {/* ================= BẮT ĐẦU KHU VỰC TỔNG QUAN ================= */}
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
              
              {/* === THANH TIẾN ĐỘ TỔNG (MASTER PROGRESS BAR) === */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-1">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider"><i className="fa-solid fa-bolt text-blue-500 mr-1.5"></i>Tiến độ thực thi hôm nay</span>
                  <span className="text-[11px] font-bold text-slate-500"><span className="text-blue-600 font-black">{tongDaXuLy}</span> / {tongSoCa} ca ({ptTong}%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
                  <div className="bg-blue-500 h-full rounded-full transition-all duration-700 ease-out relative" style={{ width: `${ptTong}%` }}>
                     <div className="absolute top-0 right-0 bottom-0 left-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] animate-[progress_1s_linear_infinite]"></div>
                  </div>
                </div>
              </div>

              {/* === LƯỚI LỆCH 5 Ô (TÍCH HỢP TỶ LỆ) === */}
              <div className="grid grid-cols-2 gap-2.5">
                
                {/* THẺ 1: KHÁCH HẸN LẠI (CAM) */}
                <div onClick={() => setOverviewTab('hen_lai')} className={`border rounded-xl p-3 shadow-sm relative overflow-hidden cursor-pointer transition-all active:scale-95 select-none ${overviewTab === 'hen_lai' ? 'bg-orange-100/70 border-orange-400 ring-2 ring-orange-400 shadow-md scale-[1.02]' : 'bg-orange-50 border-orange-200 opacity-60 hover:opacity-100'}`}>
                  <div className="absolute -right-2 -top-2 text-orange-200/50 text-4xl"><i className="fa-solid fa-clock-rotate-left"></i></div>
                  <div className="relative z-10">
                    <div className="font-black text-2xl text-orange-700 mb-0.5 flex items-baseline gap-1">
                      {demHenLaiHomNay} <span className="text-[10px] font-bold text-orange-400">/{tongSoCa}</span>
                    </div>
                    <p className="text-[10px] font-black text-orange-800 uppercase tracking-wide">Khách hẹn lại</p>
                    <p className="text-[9px] text-orange-600 mt-0.5 font-bold">Cần nhắc đi thu</p>
                  </div>
                </div>

                {/* THẺ 2: ĐÃ THU TIỀN (XANH NGỌC) */}
                <div onClick={() => setOverviewTab('da_thu')} className={`border rounded-xl p-3 shadow-sm relative overflow-hidden cursor-pointer transition-all active:scale-95 select-none ${overviewTab === 'da_thu' ? 'bg-emerald-100/70 border-emerald-400 ring-2 ring-emerald-400 shadow-md scale-[1.02]' : 'bg-emerald-50 border-emerald-200 opacity-60 hover:opacity-100'}`}>
                  <div className="absolute -right-2 -top-2 text-emerald-200/50 text-4xl"><i className="fa-solid fa-money-bill-wave"></i></div>
                  <div className="relative z-10">
                    <div className="font-black text-2xl text-emerald-700 mb-0.5 flex items-baseline gap-1">
                      {demDaThu} <span className="text-[10px] font-bold text-emerald-400">/{tongSoCa}</span>
                    </div>
                    <p className="text-[10px] font-black text-emerald-800 uppercase tracking-wide">Đã thu tiền</p>
                    <p className="text-[9px] text-emerald-600 mt-0.5 font-bold">Chờ VP đối soát</p>
                  </div>
                </div>

                {/* THẺ 3: ĐÃ CẮT ĐIỆN (ĐỎ) */}
                <div onClick={() => setOverviewTab('da_chuyen_cat_dien')} className={`border rounded-xl p-3 shadow-sm relative overflow-hidden cursor-pointer transition-all active:scale-95 select-none ${overviewTab === 'da_chuyen_cat_dien' ? 'bg-red-100/70 border-red-400 ring-2 ring-red-400 shadow-md scale-[1.02]' : 'bg-red-50 border-red-200 opacity-60 hover:opacity-100'}`}>
                  <div className="absolute -right-2 -top-2 text-red-200/50 text-4xl"><i className="fa-solid fa-scissors"></i></div>
                  <div className="relative z-10">
                    <div className="font-black text-2xl text-red-700 mb-0.5 flex items-baseline gap-1">
                      {demDaCat} <span className="text-[10px] font-bold text-red-400">/{tongSoCa}</span>
                    </div>
                    <p className="text-[10px] font-black text-red-800 uppercase tracking-wide">Đã cắt điện</p>
                    <p className="text-[9px] text-red-600 mt-0.5 font-bold">Chuyển ngưng hơi</p>
                  </div>
                </div>

                {/* THẺ 4: XÁC MINH (VÀNG) */}
                <div onClick={() => setOverviewTab('da_chuyen_xac_minh')} className={`border rounded-xl p-3 shadow-sm relative overflow-hidden cursor-pointer transition-all active:scale-95 select-none ${overviewTab === 'da_chuyen_xac_minh' ? 'bg-amber-100/70 border-amber-400 ring-2 ring-amber-400 shadow-md scale-[1.02]' : 'bg-amber-50 border-amber-200 opacity-60 hover:opacity-100'}`}>
                  <div className="absolute -right-2 -top-2 text-amber-200/50 text-4xl"><i className="fa-solid fa-receipt"></i></div>
                  <div className="relative z-10">
                    <div className="font-black text-2xl text-amber-700 mb-0.5 flex items-baseline gap-1">
                      {demXacMinh} <span className="text-[10px] font-bold text-amber-400">/{tongSoCa}</span>
                    </div>
                    <p className="text-[10px] font-black text-amber-800 uppercase tracking-wide">Xác minh Bill</p>
                    <p className="text-[9px] text-amber-600 mt-0.5 font-bold">Chờ VP check</p>
                  </div>
                </div>
              </div>

              {/* THẺ 5: CHƯA THỰC HIỆN (XANH DƯƠNG) */}
              <div onClick={() => setOverviewTab('chua_xu_ly')} className={`mt-2.5 border rounded-xl p-3 shadow-sm relative overflow-hidden cursor-pointer transition-all active:scale-95 select-none ${overviewTab === 'chua_xu_ly' ? 'bg-blue-100/70 border-blue-400 ring-2 ring-blue-400 shadow-md scale-[1.02]' : 'bg-blue-50 border-blue-200 opacity-60 hover:opacity-100'}`}>
                <div className="absolute -right-2 -top-2 text-blue-200/50 text-4xl"><i className="fa-solid fa-file-circle-question"></i></div>
                <div className="relative z-10">
                  <div className="font-black text-2xl text-blue-700 mb-0.5 flex items-baseline gap-1">
                    {demChuaXuHomNay} <span className="text-[10px] font-bold text-blue-400">/{tongSoCa}</span>
                  </div>
                  <p className="text-[10px] font-black text-blue-800 uppercase tracking-wide">Chưa xử lý</p>
                  <p className="text-[9px] text-blue-600 mt-0.5 font-bold">Đang chờ Nv thực thi</p>
                </div>
              </div>
			  
			  {/* THẺ 6: LỖI KINH DOANH - CHỈ HIỆN KHI CÓ CA BỊ TỊCH THU TỪ THỢ */}
              {demLoiKinhDoanh > 0 && (
                <div onClick={() => setOverviewTab('loi_dong_bo_kd')} className={`mt-2.5 border rounded-xl p-3 shadow-sm relative overflow-hidden cursor-pointer transition-all active:scale-95 select-none ${overviewTab === 'loi_dong_bo_kd' ? 'bg-slate-800 border-slate-900 ring-2 ring-slate-900 shadow-xl scale-[1.02]' : 'bg-slate-700 border-slate-600 hover:bg-slate-600 opacity-95'}`}>
                  <div className="absolute -right-2 -top-2 text-slate-500/30 text-5xl"><i className="fa-solid fa-bug"></i></div>
                  <div className="relative z-10">
                    <div className="font-black text-2xl text-white mb-0.5 flex items-baseline gap-1">
                      {demLoiKinhDoanh} <span className="text-[10px] font-bold text-slate-400">/{tongSoCa}</span>
                    </div>
                    <p className="text-[10px] font-black text-red-400 uppercase tracking-wide">Sai lệch KD (Đã tịch thu)</p>
                    <p className="text-[9px] text-slate-300 mt-0.5 font-bold">KH đã mất điện từ trước!</p>
                  </div>
                </div>
              )}

              {/* === BẢNG HIỂN THỊ CHI TIẾT (ĐÃ GỘP LÀM 1 DUY NHẤT) === */}
              <div className="mt-3 border-t border-slate-200 pt-3">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                  <i className={`fa-solid ${
                    overviewTab === 'loi_dong_bo_kd' ? 'fa-bug text-red-500' :
                    overviewTab === 'hen_lai' ? 'fa-clock-rotate-left text-orange-500' : 
                    overviewTab === 'da_thu' ? 'fa-money-bill-wave text-emerald-500' :
                    overviewTab === 'da_chuyen_cat_dien' ? 'fa-scissors text-red-500' :
                    overviewTab === 'da_chuyen_xac_minh' ? 'fa-receipt text-amber-500' :
                    'fa-file-circle-question text-blue-500'
                  }`}></i> 
                  Chi tiết: {
                    overviewTab === 'loi_dong_bo_kd' ? 'Hồ sơ đã tự động tịch thu (Lỗi KD)' :
                    overviewTab === 'hen_lai' ? 'Danh sách khách hẹn khất nợ' : 
                    overviewTab === 'da_thu' ? 'Danh sách ca nhân viên đã thu xong' :
                    overviewTab === 'da_chuyen_cat_dien' ? 'Danh sách khách hàng đã cắt điện' :
                    overviewTab === 'da_chuyen_xac_minh' ? 'Danh sách cần xác minh giao dịch' :
                    'Danh sách hồ sơ chưa thực hiện'
                  }
                </p>
                
                <div className="space-y-1.5 max-h-44 overflow-y-auto no-scrollbar">
                  {danhSachHienThiTongQuan.length === 0 ? (
                    <p className="text-center text-slate-400 text-[10px] italic py-3 bg-white rounded-lg border border-slate-100">Hiện tại chưa có dữ liệu...</p>
                  ) : (
                    danhSachHienThiTongQuan.map(c => (
                      <div key={c.id} className={`bg-white p-2 rounded-lg border shadow-sm flex flex-col gap-1.5 text-[10px] slide-up ${
                        overviewTab === 'hen_lai' ? 'border-orange-100' : 
                        overviewTab === 'da_thu' ? 'border-emerald-100' :
                        overviewTab === 'da_chuyen_cat_dien' ? 'border-red-100' :
                        overviewTab === 'da_chuyen_xac_minh' ? 'border-amber-100' :
                        'border-blue-100'
                      }`}>
                        
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800 text-[11px] truncate max-w-[170px]">{c.ten_kh}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black border ${
                            overviewTab === 'hen_lai' ? 'bg-orange-50 text-orange-700 border-orange-200' : 
                            overviewTab === 'da_thu' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            overviewTab === 'da_chuyen_cat_dien' ? 'bg-red-50 text-red-700 border-red-200' :
                            overviewTab === 'da_chuyen_xac_minh' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            NV: {c.nguoi_phu_trach || 'CHƯA GIAO'}
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-center text-slate-500">
                          <div className="flex gap-1.5 items-center">
                            <button 
                              onClick={() => { 
                                navigator.clipboard.writeText(c.ma_pe); 
                                toast.success(`Đã copy mã PE: ${c.ma_pe}`); 
                              }}
                              className="font-mono font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 active:scale-95 px-1.5 py-0.5 rounded transition-all border border-blue-100 flex items-center"
                            >
                              <i className="fa-regular fa-copy mr-1 text-[9px]"></i>{c.ma_pe}
                            </button>
                            
                            {c.so_dien_thoai ? (
                              <a href={`tel:${c.so_dien_thoai}`} className="font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:scale-95 px-1.5 py-0.5 rounded transition-all border border-emerald-100 flex items-center">
                                <i className="fa-solid fa-phone mr-1 text-[9px]"></i>{c.so_dien_thoai}
                              </a>
                            ) : (
                              <span className="font-medium text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 flex items-center">
                                <i className="fa-solid fa-phone-slash mr-1 text-[9px]"></i>Không SĐT
                              </span>
                            )}
                          </div>
                          
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

        {/* ================= BẮT ĐẦU KHỐI TỒN ĐỌNG NGÀY HÔM QUA ================= */}
        {loading ? (
          /* Hiệu ứng Skeleton Loading lúc đang tải dữ liệu Tồn Đọng */
          <div className="bg-white rounded-xl shadow-sm border-2 border-dashed border-slate-200 p-3 mb-3 shrink-0 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-2/3 mb-3"></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="h-14 bg-slate-100 rounded-xl flex-1"></div>
              <div className="h-14 bg-slate-100 rounded-xl flex-1"></div>
            </div>
          </div>
        ) : (tonDongHenLai.length > 0 || tonDongChuaLam.length > 0) && (
          <div className="bg-white rounded-xl shadow-sm border-2 border-dashed border-rose-200 overflow-hidden mb-3 fade-in shrink-0">
            <button
              onClick={() => setIsBacklogExpanded(!isBacklogExpanded)}
              className="w-full flex justify-between items-center p-3 bg-rose-50/60 hover:bg-rose-100/60 transition-colors"
            >
              <h3 className="text-xs font-black text-rose-800 uppercase tracking-wider flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation text-rose-500 animate-pulse"></i> 
                Hàng Tồn Đọng Ngày Hôm Qua ({tonDongHenLai.length + tonDongChuaLam.length} ca)
              </h3>
              <i className={`fa-solid fa-chevron-down text-rose-500 transition-transform ${isBacklogExpanded ? 'rotate-180' : ''}`}></i>
            </button>

            {isBacklogExpanded && (
              <div className="p-3 border-t border-rose-100 bg-slate-50/50 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  
                  {/* Tab nhỏ 1: Hẹn lại */}
                  <div 
                    onClick={() => setBacklogTab('hen_lai')}
                    className={`border rounded-xl p-2.5 text-center cursor-pointer transition-all ${
                      backlogTab === 'hen_lai' ? 'bg-orange-100 border-orange-400 ring-1 ring-orange-400 font-bold' : 'bg-white border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="text-lg font-black text-orange-700">{tonDongHenLai.length}</div>
                    <p className="text-[9px] uppercase text-slate-500 font-bold">Khách hẹn lại</p>
                  </div>

                  {/* Tab nhỏ 2: Chưa xử lý */}
                  <div 
                    onClick={() => setBacklogTab('chua_xu_ly')}
                    className={`border rounded-xl p-2.5 text-center cursor-pointer transition-all ${
                      backlogTab === 'chua_xu_ly' ? 'bg-red-100 border-red-400 ring-1 ring-red-400 font-bold' : 'bg-white border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="text-lg font-black text-red-700">{tonDongChuaLam.length}</div>
                    <p className="text-[9px] uppercase text-slate-500 font-bold">Bỏ sót / Chưa làm</p>
                  </div>
                </div>

                {/* Chi tiết danh sách hàng tồn */}
                <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar pt-1">
                  {danhSachTonDongHienThi.map(c => (
                    <div key={c.id} className={`bg-white p-2 rounded-lg border shadow-sm flex flex-col gap-1 text-[10px] slide-up transition-colors ${selectedUnassignedIds.includes(c.id) ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/40' : 'border-slate-200'}`}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2 min-w-0">
                          {/* MỚI: Checkbox chọn nhiều ca để giao cùng lúc */}
                          <button onClick={() => toggleUnassigned(c.id)} className="shrink-0 text-base leading-none">
                            <i className={`fa-regular ${selectedUnassignedIds.includes(c.id) ? 'fa-square-check text-blue-600' : 'fa-square text-slate-300'}`}></i>
                          </button>
                          <span className="font-bold text-slate-800 truncate max-w-[150px]">{c.ten_kh}</span>
                        </div>
                        <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[8px] font-black border border-slate-200 uppercase shrink-0">
                          Cũ: {c.nguoi_phu_trach || 'Chưa giao'}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center text-slate-500 mt-0.5">
                        <div className="flex gap-1.5 items-center">
                          <button 
                            onClick={() => { navigator.clipboard.writeText(c.ma_pe); toast.success(`Đã copy: ${c.ma_pe}`); }}
                            className="font-mono font-bold text-blue-700 bg-blue-50 px-1 py-0.5 rounded border border-blue-100 flex items-center"
                          >
                            <i className="fa-regular fa-copy mr-1"></i>{c.ma_pe}
                          </button>

                          {c.so_dien_thoai ? (
                            <a href={`tel:${c.so_dien_thoai}`} className="font-medium text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-100 flex items-center">
                              <i className="fa-solid fa-phone mr-1"></i>{c.so_dien_thoai}
                            </a>
                          ) : (
                            <span className="text-slate-400 bg-slate-50 px-1 py-0.5 rounded border border-slate-100">Không SĐT</span>
                          )}
                        </div>
                        <span className="font-mono text-slate-400 font-bold"><i className="fa-solid fa-location-dot mr-1"></i>{c.ma_tru_sach}</span>
                      </div>

                      {/* CÁC NÚT TÁC NGHIỆP TÙY THEO TAB TỒN ĐỌNG (chỉ còn thao tác Đội trưởng, nút Giao việc đã gộp xuống thanh nổi phía dưới) */}
                      {backlogTab === 'hen_lai' && (
                        <div className="flex gap-1 mt-1.5 border-t border-slate-100 pt-1.5 overflow-x-auto no-scrollbar items-center">
                          <button
                            onClick={() => handleDoiTruongXuLyTonDong(c, 'da_thu')}
                            className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 px-2 py-1.5 rounded text-[9px] font-black shrink-0 flex items-center gap-1 transition-colors"
                          >
                            <i className="fa-solid fa-check"></i> CHỐT ĐÃ THU
                          </button>
                          <button
                            onClick={() => handleDoiTruongXuLyTonDong(c, 'da_chuyen_cat_dien')}
                            className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 px-2 py-1.5 rounded text-[9px] font-black shrink-0 flex items-center gap-1 transition-colors"
                          >
                            <i className="fa-solid fa-scissors"></i> CHUYỂN CẮT ĐIỆN
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {/* ================= KẾT THÚC KHU VỰC TỒN ĐỌNG ================= */}

        <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2 mb-2 mt-1">
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
                            <div key={ca.id} className={`bg-white p-2 rounded-lg border shadow-sm text-[10px] slide-up transition-colors ${selectedUnassignedIds.includes(ca.id) ? 'border-blue-400 ring-1 ring-blue-400 bg-blue-50/40' : 'border-slate-100'}`}>
                              {/* Dòng 1: Checkbox + Tên Khách hàng */}
                              <div className="flex items-center gap-2 mb-1.5">
                                <button onClick={() => toggleUnassigned(ca.id)} className="shrink-0 text-base leading-none">
                                  <i className={`fa-regular ${selectedUnassignedIds.includes(ca.id) ? 'fa-square-check text-blue-600' : 'fa-square text-slate-300'}`}></i>
                                </button>
                                <div className="font-bold text-slate-800 truncate text-[11px]">{ca.ten_kh}</div>
                              </div>
                              
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
                      
                      {/* RẼ NHÁNH IF: 1 nút duy nhất mở Popup "Giao việc cho ai?" cho cả khối Trạm/Tuyến này */}
                      <div className={`flex flex-wrap gap-1.5 border-t pt-2 mt-1 ${isTram ? 'border-amber-100' : 'border-blue-100'}`}>
                        {assignMode === 'theo_nhom' && danhSachNhom.length === 0 ? (
                          <span className="text-[10px] text-slate-400 italic w-full text-center py-1">Chưa có nhóm nào — bấm "+ Tạo Tổ/Nhóm" ở khu Giỏ Của Nhóm bên dưới để lập nhóm mới!</span>
                        ) : (
                          <button
                            onClick={() => openAssignPopup(
                              danhSachCa,
                              assignMode,
                              `Giao ${danhSachCa.length} ca`
                            )}
                            className={`w-full px-3 py-2 rounded-lg shadow-sm text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                              assignMode === 'ca_nhan'
                                ? 'bg-blue-50 border border-blue-200 hover:bg-blue-600 hover:text-white text-blue-700'
                                : 'bg-purple-50 border border-purple-200 hover:bg-purple-600 hover:text-white text-purple-700'
                            }`}
                          >
                            <i className="fa-solid fa-share"></i> Giao việc ({danhSachCa.length} ca)
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
          </div>
        )}
      </div>

      {/* MỚI: THANH "GIAO VIỆC ĐÃ CHỌN" - đặt NGOÀI vùng cuộn, ngay trên Giỏ hàng -> tuyệt đối không bị cuộn mất */}
      {mainTab === 'phan_cong' && selectedUnassignedIds.length > 0 && (
 		<div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-md bg-blue-600 text-white p-2.5 flex items-center justify-between shadow-[0_-4px_10px_-2px_rgba(0,0,0,0.15)] z-[59] fade-in">
          <span className="text-[11px] font-black pl-1">
            <i className="fa-solid fa-square-check mr-1.5"></i>{selectedUnassignedIds.length} ca đã chọn
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setSelectedUnassignedIds([])}
              className="bg-blue-500 hover:bg-blue-400 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors"
            >
              Huỷ chọn
            </button>
            <button
              onClick={() => openAssignPopup(
                danhSach.filter(c => selectedUnassignedIds.includes(c.id)),
                assignMode,
                `Giao lẻ ${selectedUnassignedIds.length} ca đã chọn`
              )}
              className="bg-white text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-[10px] font-black shadow-sm active:scale-95 transition-all flex items-center gap-1"
            >
              <i className="fa-solid fa-share"></i> Giao việc
            </button>
          </div>
        </div>
      )}

      {/* KHU VỰC GIỎ HÀNG (ĐƯỢC BỌC TRONG IF/ELSE KHỔNG LỒ NHƯ THẢO LUẬN) */}
      {mainTab === 'phan_cong' && (
        <div className="bg-white border-t border-slate-200 rounded-t-2xl shadow-[0_-5px_15px_-3px_rgba(0,0,0,0.05)] mt-auto z-40 transition-all duration-300 relative shrink-0">
          <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto my-2"></div>
          
          {assignMode === 'ca_nhan' ? (
            // ================== BỘ GIAO DIỆN 1: GIỎ CÁ NHÂN ==================
            <>
              <div className="px-4 pb-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase flex items-center justify-between mb-3">
                  <span><i className="fa-solid fa-users text-blue-600 mr-1"></i> Giỏ Cá Nhân</span>
                  <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-[9px]">{caDaGiaoCaNhan.length} Đã giao</span>
                </h3>
                
                <div className="grid grid-cols-2 gap-2 max-h-[30vh] overflow-y-auto no-scrollbar pb-4">
                  {danhSachTho.map(tho => {
                    const soCa = gioViec[tho.id]?.length || 0;
                    const isActive = activeWorkerCart === tho.id;
                    return (
                      <div 
                        key={tho.id} 
                        onClick={() => setActiveWorkerCart(isActive ? null : tho.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${isActive ? 'bg-blue-600 border-blue-700 shadow-lg scale-[1.02]' : soCa > 0 ? 'bg-gradient-to-br from-slate-50 to-blue-50 border-blue-200 hover:border-blue-400' : 'bg-slate-50 border-slate-200 opacity-70'}`}
                      >
                        <div className="flex justify-between items-start">
                          <span className={`font-black text-sm ${isActive ? 'text-white' : 'text-slate-700'}`}>{tho.ho_ten}</span>
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

              {activeWorkerCart && (
                <div className="absolute bottom-[100%] left-0 w-full bg-slate-100 border-t border-slate-300 shadow-2xl h-[50vh] flex flex-col z-30 slide-up rounded-t-xl">
                  <div className="bg-blue-700 p-3 flex justify-between items-center text-white rounded-t-xl shrink-0">
                    <h4 className="font-bold text-sm uppercase">Giỏ của {danhSachTho.find(t => t.id === activeWorkerCart)?.ho_ten} ({gioViec[activeWorkerCart]?.length} ca)</h4>
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
                        <div key={c.id} onClick={() => toggleMicroTask(c.id)} className={`flex items-center p-2 bg-white rounded-lg border cursor-pointer transition-colors ${selectedMicroTasks.includes(c.id) ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300'}`}>
                          <div className="mr-3 ml-1 text-lg"><i className={`fa-regular ${selectedMicroTasks.includes(c.id) ? 'fa-square-check text-blue-600' : 'fa-square text-slate-300'}`}></i></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between mb-0.5">
                              <span className="font-bold text-[10px] text-slate-500 bg-slate-100 px-1 rounded truncate max-w-[120px]"><i className="fa-solid fa-location-dot mr-1"></i>{c.ma_tru_sach}</span>
                              <span className="font-mono font-bold text-[10px] text-blue-700 bg-blue-50 px-1 rounded">{c.ma_pe}</span>
                            </div>
                            <h5 className="font-bold text-xs text-slate-800 truncate">{c.ten_kh}</h5>
                            <p className="text-[10px] text-slate-500 mt-0.5 font-medium"><i className="fa-solid fa-layer-group mr-1 text-slate-300"></i>Sổ: {c.so_gcs} | {c.nhom_phan_cong}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {selectedMicroTasks.length > 0 && (
                    <div className="bg-white border-t border-slate-200 p-3 shrink-0 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.1)] slide-up">
                      <div className="text-[10px] font-bold text-slate-500 mb-2 text-center uppercase tracking-wider">Chuyển {selectedMicroTasks.length} ca sang:</div>
                      <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar">
                        {danhSachTho.filter(t => t.id !== activeWorkerCart).map(thoNhan => (
                          <button key={thoNhan.id} onClick={() => handleChuyenGiaoCaLe(thoNhan)} className="shrink-0 bg-blue-100 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 px-4 py-2 rounded-lg font-bold text-xs transition-colors">
                            {thoNhan.ho_ten}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            // ================== BỘ GIAO DIỆN 2: GIỎ NHÓM (Bản copy độc lập) ==================
            <>
              <div className="px-4 pb-2">
                <h3 className="text-xs font-bold text-purple-800 uppercase flex items-center justify-between mb-3">
                  <span><i className="fa-solid fa-people-group text-purple-600 mr-1"></i> Giỏ Của Nhóm</span>
                  <div className="flex items-center gap-2">
                    {/* MỚI: Nút "+ Tạo Tổ/Nhóm" chuyển từ khu Kho Việc xuống đây - luôn hiện, không phụ thuộc có ca mới hay không */}
                    <button 
                      onClick={() => {
                        setEditingGroup(null); // Đảm bảo là chế độ Tạo Mới
                        setNewGroupName('');
                        setNewGroupMembers([]);
                        setIsCreatingGroup(true);
                      }} 
                      className="text-[9px] font-black text-purple-600 bg-purple-100 hover:bg-purple-200 px-2 py-0.5 rounded-full transition-colors active:scale-95"
                    >
                      + Tạo Tổ/Nhóm
                    </button>
                    <span className="bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full text-[9px]">{caDaGiaoNhom.length} Đã giao</span>
                  </div>
                </h3>
                
                <div className="grid grid-cols-2 gap-2 max-h-[30vh] overflow-y-auto no-scrollbar pb-4">
                  {danhSachNhom.length === 0 ? (
                    <div className="col-span-2 text-center text-slate-400 text-[10px] italic py-4">Chưa có nhóm nào được lập hôm nay!</div>
                  ) : danhSachNhom.map(nhom => {
                    const soCa = gioViecNhom[nhom.ten_nhom]?.length || 0;
                    const isActive = activeGroupCart === nhom.id;
                    return (
                      <div 
                        key={nhom.id} 
                        onClick={() => setActiveGroupCart(isActive ? null : nhom.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all relative group overflow-hidden ${isActive ? 'bg-purple-600 border-purple-700 shadow-lg scale-[1.02]' : soCa > 0 ? 'bg-gradient-to-br from-slate-50 to-purple-50 border-purple-200 hover:border-purple-400' : 'bg-slate-50 border-slate-200 opacity-70'}`}
                      >
                        {/* Bộ công cụ SỬA / XÓA nằm góc trên cùng bên phải */}
                        <div className="absolute top-0 right-0 flex">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingGroup(nhom); // Kích hoạt chế độ Sửa
                              setNewGroupName(nhom.ten_nhom);
                              setNewGroupMembers(nhom.thanh_vien_ids ? nhom.thanh_vien_ids.split(',') : []);
                              setIsCreatingGroup(true);
                            }}
                            className={`p-2 rounded-bl-lg transition-colors ${isActive ? 'bg-purple-700 hover:bg-blue-500 text-purple-200 hover:text-white' : 'bg-slate-100 hover:bg-blue-500 text-slate-400 hover:text-white'}`}
                            title="Sửa thành viên & Tên nhóm"
                          >
                            <i className="fa-solid fa-pen text-[10px]"></i>
                          </button>
                          <button 
                            onClick={(e) => handleDeleteGroup(e, nhom.id, nhom.ten_nhom)}
                            className={`p-2 transition-colors ${isActive ? 'bg-purple-700 hover:bg-rose-500 text-purple-200 hover:text-white' : 'bg-slate-100 hover:bg-rose-500 text-slate-400 hover:text-white'}`}
                            title="Giải tán nhóm này"
                          >
                            <i className="fa-solid fa-trash-can text-[10px]"></i>
                          </button>
                        </div>

                        <div className="flex justify-between items-start pr-12">
                          <span className={`font-black text-sm truncate ${isActive ? 'text-white' : 'text-slate-700'}`}>{nhom.ten_nhom}</span>
                        </div>
                        <div className={`mt-2 font-mono font-black text-xl flex items-end gap-1 ${isActive ? 'text-white' : soCa > 0 ? 'text-purple-700' : 'text-slate-400'}`}>
                          {soCa} <span className="text-[10px] uppercase font-bold tracking-wider opacity-70 mb-0.5">Ca</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {activeGroupCart && (
                <div className="absolute bottom-[100%] left-0 w-full bg-slate-100 border-t border-slate-300 shadow-2xl h-[50vh] flex flex-col z-30 slide-up rounded-t-xl">
                  <div className="bg-purple-700 p-3 flex justify-between items-center text-white rounded-t-xl shrink-0">
                    <h4 className="font-bold text-sm uppercase">Giỏ {danhSachNhom.find(t => t.id === activeGroupCart)?.ten_nhom} ({gioViecNhom[danhSachNhom.find(t => t.id === activeGroupCart)?.ten_nhom]?.length || 0} ca)</h4>
                    <button onClick={() => { setActiveGroupCart(null); setSelectedMicroTasks([]); }} className="text-white/80 hover:text-white"><i className="fa-solid fa-xmark text-lg"></i></button>
                  </div>
                  
                  <div className="p-1 bg-yellow-100 text-yellow-800 text-[10px] font-bold text-center border-b border-yellow-200">
                    <i className="fa-solid fa-circle-info mr-1"></i> Tick chọn các ca để điều chuyển sang nhóm khác
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 space-y-1.5 no-scrollbar">
                    {gioViecNhom[danhSachNhom.find(t => t.id === activeGroupCart)?.ten_nhom]?.length === 0 || !gioViecNhom[danhSachNhom.find(t => t.id === activeGroupCart)?.ten_nhom] ? (
                      <p className="text-center text-slate-400 text-xs mt-10 italic">Nhóm chưa có việc.</p>
                    ) : (
                      [...gioViecNhom[danhSachNhom.find(t => t.id === activeGroupCart)?.ten_nhom]].sort((a,b) => a.nhom_phan_cong.localeCompare(b.nhom_phan_cong)).map(c => (
                        <div key={c.id} onClick={() => toggleMicroTask(c.id)} className={`flex items-center p-2 bg-white rounded-lg border cursor-pointer transition-colors ${selectedMicroTasks.includes(c.id) ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500' : 'border-slate-200 hover:border-slate-300'}`}>
                          <div className="mr-3 ml-1 text-lg"><i className={`fa-regular ${selectedMicroTasks.includes(c.id) ? 'fa-square-check text-purple-600' : 'fa-square text-slate-300'}`}></i></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between mb-0.5">
                              <span className="font-bold text-[10px] text-slate-500 bg-slate-100 px-1 rounded truncate max-w-[120px]"><i className="fa-solid fa-location-dot mr-1"></i>{c.ma_tru_sach}</span>
                              <span className="font-mono font-bold text-[10px] text-purple-700 bg-purple-50 px-1 rounded">{c.ma_pe}</span>
                            </div>
                            <h5 className="font-bold text-xs text-slate-800 truncate">{c.ten_kh}</h5>
                            <p className="text-[10px] text-slate-500 mt-0.5 font-medium"><i className="fa-solid fa-layer-group mr-1 text-slate-300"></i>Sổ: {c.so_gcs} | {c.nhom_phan_cong}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {selectedMicroTasks.length > 0 && (
                    <div className="bg-white border-t border-slate-200 p-3 shrink-0 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.1)] slide-up">
                      <div className="text-[10px] font-bold text-slate-500 mb-2 text-center uppercase tracking-wider">Chuyển {selectedMicroTasks.length} ca sang:</div>
                      <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar">
                        {danhSachNhom.filter(t => t.id !== activeGroupCart).map(nhomNhan => (
                          <button key={nhomNhan.id} onClick={() => handleChuyenGiaoCaLeNhom(nhomNhan)} className="shrink-0 bg-purple-100 hover:bg-purple-600 text-purple-700 hover:text-white border border-purple-200 px-4 py-2 rounded-lg font-bold text-xs transition-colors">
                            {nhomNhan.ten_nhom}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================= MODAL TẠO / SỬA NHÓM ================= */}
      {isCreatingGroup && (
        <div className="fixed inset-0 bg-slate-900/60 z-[120] flex items-center justify-center p-4 fade-in backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl slide-up">
            <div className="p-4 border-b border-slate-100 bg-purple-50 flex justify-between items-center">
              <h3 className="font-black text-purple-800 uppercase flex items-center gap-2 text-sm">
                <i className={`fa-solid ${editingGroup ? 'fa-pen-to-square' : 'fa-people-group'}`}></i> 
                {editingGroup ? 'Hiệu Chỉnh Nhóm' : 'Lập Nhóm Mới'}
              </h3>
              <button onClick={() => { setIsCreatingGroup(false); setEditingGroup(null); setNewGroupName(''); setNewGroupMembers([]); }} className="text-slate-400 hover:text-rose-500 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm transition-colors">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            
            {/* Form trỏ về hàm handleSaveGroup mới */}
            <form onSubmit={handleSaveGroup} className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Tên Tổ / Nhóm</label>
                <input 
                  type="text" 
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Ví dụ: Nhóm 1, Trạm A..." 
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Chọn thành viên (Đã chọn: {newGroupMembers.length})</label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1 no-scrollbar">
                  
                  {/* BỘ LỌC THÔNG MINH (Bản nâng cấp): Lấy thợ trống + thợ ĐANG NẰM TRONG nhóm này (nếu đang sửa) */}
                  {(() => {
                    // Lọc ra các nhóm KHÁC nhóm đang sửa để thu thập ID những người đã bị bế đi
                    const cacNhomKhac = editingGroup ? danhSachNhom.filter(n => n.id !== editingGroup.id) : danhSachNhom;
                    const idDaBiLay = cacNhomKhac.flatMap(n => n.thanh_vien_ids ? n.thanh_vien_ids.split(',') : []);
                    
                    const thoHienThi = danhSachTho.filter(t => !idDaBiLay.includes(t.id));
                    
                    if (thoHienThi.length === 0) return <div className="col-span-2 text-center text-xs text-rose-500 font-bold p-3 bg-rose-50 rounded-lg">Không còn nhân viên nào rảnh rỗi!</div>;
                    
                    return thoHienThi.map(tho => {
                      const isSelected = newGroupMembers.includes(tho.id);
                      return (
                        <label key={tho.id} className={`flex items-center gap-2 p-2.5 border rounded-xl cursor-pointer transition-colors select-none ${isSelected ? 'bg-purple-50 border-purple-500 ring-1 ring-purple-500' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-300'}`}>
                            {isSelected && <i className="fa-solid fa-check text-[10px]"></i>}
                          </div>
                          <span className={`text-[11px] font-bold truncate ${isSelected ? 'text-purple-700' : 'text-slate-600'}`}>{tho.ho_ten}</span>
                          <input type="checkbox" className="hidden" checked={isSelected} onChange={(e) => {
                            if (e.target.checked) setNewGroupMembers([...newGroupMembers, tho.id]);
                            else setNewGroupMembers(newGroupMembers.filter(id => id !== tho.id));
                          }}/>
                        </label>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="pt-2">
                <button type="submit" className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl text-sm shadow-md active:scale-95 transition-all uppercase tracking-wider">
                  {editingGroup ? 'CẬP NHẬT NHÓM' : 'KHỞI TẠO NHÓM'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= POPUP CHI TIẾT TIẾN ĐỘ CÁ NHÂN ================= */}
      {selectedWorkerProgress && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-3 fade-in backdrop-blur-sm">
          <div className="bg-slate-100 rounded-xl w-full max-w-xs overflow-hidden shadow-2xl slide-up">
            <div className="p-3.5 bg-blue-600 text-white flex justify-between items-center shadow-sm">
              <h3 className="font-bold text-xs uppercase tracking-wider flex items-center gap-2 truncate">
                <i className="fa-solid fa-user-check"></i>
                <span className="truncate">{selectedWorkerProgress.thoObj.ho_ten}</span>
              </h3>
              <button onClick={() => setSelectedWorkerProgress(null)} className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors"><i className="fa-solid fa-xmark"></i></button>
            </div>
            
            <div className="p-3 bg-white grid grid-cols-2 gap-2">
              <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-2.5 flex flex-col items-center justify-center text-center shadow-sm">
                <span className="text-2xl font-black text-emerald-700 leading-none mb-1">{selectedWorkerProgress.chiTiet.da_thu}</span>
                <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-tight">Đã thu tiền</span>
              </div>
              <div className="border border-red-200 bg-red-50 rounded-lg p-2.5 flex flex-col items-center justify-center text-center shadow-sm">
                <span className="text-2xl font-black text-red-700 leading-none mb-1">{selectedWorkerProgress.chiTiet.da_cat}</span>
                <span className="text-[9px] font-bold text-red-600 uppercase tracking-tight">Đã cắt điện</span>
              </div>
              <div className="border border-orange-200 bg-orange-50 rounded-lg p-2.5 flex flex-col items-center justify-center text-center shadow-sm">
                <span className="text-2xl font-black text-orange-700 leading-none mb-1">{selectedWorkerProgress.chiTiet.hen_lai}</span>
                <span className="text-[9px] font-bold text-orange-600 uppercase tracking-tight">Khách hẹn lại</span>
              </div>
              <div className="border border-amber-200 bg-amber-50 rounded-lg p-2.5 flex flex-col items-center justify-center text-center shadow-sm">
                <span className="text-2xl font-black text-amber-700 leading-none mb-1">{selectedWorkerProgress.chiTiet.xac_minh}</span>
                <span className="text-[9px] font-bold text-amber-600 uppercase tracking-tight">Chờ duyệt bill</span>
              </div>
            </div>
            
            <div className="p-3 bg-slate-50 border-t border-slate-200">
               <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 flex justify-between items-center shadow-sm">
                 <span className="font-bold text-xs text-blue-800 uppercase flex items-center gap-2">
                   <i className="fa-solid fa-file-circle-question"></i> Chưa xử lý
                 </span>
                 <span className="text-2xl font-black text-blue-700 leading-none">{selectedWorkerProgress.chiTiet.chua_xu_ly}</span>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= POPUP "GIAO VIỆC CHO AI?" ================= */}
      {assignPopup && (
        <div className="fixed inset-0 bg-slate-900/60 z-[130] flex items-center justify-center p-4 fade-in backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl slide-up">
            <div className="p-4 border-b border-slate-100 bg-blue-50 flex justify-between items-center">
              <div>
                <h3 className="font-black text-blue-800 uppercase text-sm">Giao việc cho ai?</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{assignPopup.title}</p>
              </div>
              <button onClick={() => setAssignPopup(null)} className="text-slate-400 hover:text-rose-500 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm transition-colors">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* MỚI: Khối "Danh sách đã chọn" - liệt kê lại các ca sắp giao để xác nhận trước khi chọn người */}
            <div className="px-4 pt-3 pb-1 border-b border-slate-100 bg-slate-50/60">
              <p className="text-[9px] font-black text-slate-400 uppercase mb-1.5">Danh sách đã chọn ({assignPopup.danhSachCa.length})</p>
              <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                {assignPopup.danhSachCa.map(c => (
                  <div key={c.id} className="text-[11px] text-slate-600 flex justify-between gap-2">
                    <span className="truncate">{c.ten_kh}</span>
                    <span className="font-mono text-slate-400 shrink-0">{c.ma_pe}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 max-h-[320px] overflow-y-auto space-y-1.5">
              {assignPopup.type === 'ca_nhan' ? (
                danhSachTho.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-4">Chưa có thợ nào</p>
                ) : (
                  [...danhSachTho]
                    .sort((a, b) => (tienDoThoMap[a.id]?.tongCa || 0) - (tienDoThoMap[b.id]?.tongCa || 0))
                    .map(tho => {
                      const soCa = tienDoThoMap[tho.id]?.tongCa || 0;
                      const isSelected = assignPopup.selectedId === tho.id;
                      return (
                        <button
                          key={tho.id}
                          onClick={() => setAssignPopup(prev => ({ ...prev, selectedId: tho.id }))}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                          <span className={`text-[13px] font-bold ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{tho.ho_ten}</span>
                          <span className="flex items-center gap-1.5">
                            <span className={`text-[11px] ${isSelected ? 'text-blue-600' : 'text-slate-400'}`}>{soCa} ca</span>
                            {isSelected && <i className="fa-solid fa-circle-check text-blue-500 text-sm"></i>}
                          </span>
                        </button>
                      );
                    })
                )
              ) : (
                danhSachNhom.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-4">Chưa có nhóm nào</p>
                ) : (
                  [...danhSachNhom]
                    .sort((a, b) => (tienDoNhomMap[a.ten_nhom]?.tongCa || 0) - (tienDoNhomMap[b.ten_nhom]?.tongCa || 0))
                    .map(nhom => {
                      const soCa = tienDoNhomMap[nhom.ten_nhom]?.tongCa || 0;
                      const isSelected = assignPopup.selectedId === nhom.id;
                      return (
                        <button
                          key={nhom.id}
                          onClick={() => setAssignPopup(prev => ({ ...prev, selectedId: nhom.id }))}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${isSelected ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                          <span className={`text-[13px] font-bold ${isSelected ? 'text-purple-700' : 'text-slate-700'}`}>
                            <i className="fa-solid fa-users mr-1.5 text-[11px]"></i>{nhom.ten_nhom}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className={`text-[11px] ${isSelected ? 'text-purple-600' : 'text-slate-400'}`}>{soCa} ca</span>
                            {isSelected && <i className="fa-solid fa-circle-check text-purple-500 text-sm"></i>}
                          </span>
                        </button>
                      );
                    })
                )
              )}
            </div>

            <div className="p-4 border-t border-slate-100 space-y-2">
              <button
                onClick={handleConfirmAssignPopup}
                disabled={!assignPopup.selectedId}
                className="w-full bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-sm active:scale-95 transition-all text-sm"
              >
                {assignPopup.selectedId
                  ? `Xác nhận giao cho ${assignPopup.type === 'ca_nhan' ? danhSachTho.find(t => t.id === assignPopup.selectedId)?.ho_ten : danhSachNhom.find(n => n.id === assignPopup.selectedId)?.ten_nhom}`
                  : 'Chọn 1 người/nhóm ở trên'}
              </button>
              <button onClick={() => setAssignPopup(null)} className="w-full bg-white border border-slate-200 text-slate-500 font-bold py-2.5 rounded-xl text-sm">
                Huỷ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
