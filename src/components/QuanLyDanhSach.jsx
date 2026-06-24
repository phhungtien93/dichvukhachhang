import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { toast } from 'react-hot-toast';


// THÊM 2 DÒNG IMPORT BẢN ĐỒ VÀO ĐÂY
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// THUẬT TOÁN TẠO GHIM (PIN) TÙY CHỈNH THEO MÀU TRẠNG THÁI
const createCustomIcon = (trang_thai) => {
  let color = 'text-slate-500'; let bg = 'bg-slate-100 border-slate-400';
  if (trang_thai === 'cho_cat') { color = 'text-red-600'; bg = 'bg-red-100 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]'; }
  else if (trang_thai === 'da_cat') { color = 'text-green-600'; bg = 'bg-green-100 border-green-500'; }
  else if (trang_thai === 'tro_ngai') { color = 'text-purple-600'; bg = 'bg-purple-100 border-purple-500'; }
  
  return L.divIcon({
    html: `<div class="flex items-center justify-center w-8 h-8 rounded-full ${bg} border-[3px] shadow-lg"><i class="fa-solid fa-bolt ${color} text-sm"></i></div>`,
    className: 'custom-leaflet-icon',
    iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32],
  });
};


// THUẬT TOÁN NÉN ẢNH CHẠY NGẦM (GIẢM 75% DUNG LƯỢNG)
const compressImage = async (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024; // Khóa độ phân giải tối đa
        let scaleSize = 1;
        if (img.width > MAX_WIDTH) scaleSize = MAX_WIDTH / img.width;
        
        canvas.width = img.width * scaleSize;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Xuất file mới với chất lượng ép xuống 25% (0.25)
        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.25);
      };
    };
  });
};

// HÀM LẤY TỌA ĐỘ GPS (CÓ CHỐNG LỖI NẾU KHÁCH TỪ CHỐI QUYỀN)
const getCurrentLocation = () => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null); // Nếu điện thoại đời quá cũ
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (err) => { console.warn("Lỗi GPS:", err); resolve(null); }, // Bị từ chối quyền thì thôi, cho qua luôn
      { enableHighAccuracy: true, timeout: 5000 } // Chờ tối đa 5 giây
    );
  });
};

export default function QuanLyDanhSach() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // ================= ADMIN STATES =================
  const [adminView, setAdminView] = useState('list');
  const [usersList, setUsersList] = useState([]);
  const [editUserId, setEditUserId] = useState(null);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('user');
  const [selectedTabsAccess, setSelectedTabsAccess] = useState(['cho_cat', 'da_cat', 'dinh_ky', 'hoan_tat']);

  // ================= DỮ LIỆU KHÁCH HÀNG =================
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('list'); 
  const [currentId, setCurrentId] = useState(null); 
  const [customerInfo, setCustomerInfo] = useState(null);
  const [customerLogs, setCustomerLogs] = useState([]); 

  const [maPE, setMaPE] = useState('');
  const [tenKH, setTenKH] = useState('');
  const [diaChi, setDiaChi] = useState('');
  const [soDienThoai, setSoDienThoai] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [soTienNo, setSoTienNo] = useState('');
  const [lyDoNgung, setLyDoNgung] = useState('no_cuoc'); // Lưu 3 nguyên nhân: no_cuoc | kh_yeu_cau | bat_thuong

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('cho_cat'); 

  const [actionModal, setActionModal] = useState({ isOpen: false, type: '', title: '' });
  const [actionDate, setActionDate] = useState('');
  const [actionNote, setActionNote] = useState(''); 
  const [actionImage, setActionImage] = useState(null); // Biến lưu trữ file ảnh vừa chụp
  const [previewImage, setPreviewImage] = useState(null); // Biến lưu link ảnh đang được phóng to

  const ALL_SYSTEM_TABS = [
    { id: 'cho_xac_minh', name: 'Xác Minh', icon: 'fa-user-clock', color: 'bg-indigo-500' },
    { id: 'cho_cat', name: 'Chờ Cắt', icon: 'fa-triangle-exclamation', color: 'bg-orange-500' },
    { id: 'da_cat', name: 'Đã Cắt', icon: 'fa-scissors', color: 'bg-red-500' },
    { id: 'dinh_ky', name: 'Định Kỳ', icon: 'fa-clock-rotate-left', color: 'bg-amber-500' },
    { id: 'hoan_tat', name: 'Đã Xong', icon: 'fa-check-double', color: 'bg-emerald-500' },
  ];

  // ================= AUTH EFFECT =================
  // TỰ ĐỘNG LƯU TAB VÀO BỘ NHỚ TRÌNH DUYỆT MỖI KHI CHUYỂN TAB
  useEffect(() => {
    if (activeTab) localStorage.setItem('evn_saved_tab', activeTab);
  }, [activeTab]);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setIsAuthLoading(false);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else { setProfile(null); setIsAuthLoading(false); }
    });
  }, []);

  const fetchProfile = async (userId) => {
    const { data, error } = await supabase.from('user_profiles').select('*').eq('id', userId).single();
    if (!error && data) {
      setProfile(data);
      
      // Khôi phục trí nhớ: Lấy Tab đã lưu trong máy ra kiểm tra
      const savedTab = localStorage.getItem('evn_saved_tab');
      // Kiểm tra xem nhân viên này có quyền xem cái Tab vừa được lưu không
      const hasAccessToSavedTab = data.role === 'admin' || (data.tabs_access && data.tabs_access.includes(savedTab));
      
      if (savedTab && hasAccessToSavedTab) {
        setActiveTab(savedTab); // Nếu hợp lệ, mở đúng tab lúc nãy đang xem
      } else if (data.role === 'admin') {
        setActiveTab('cho_xac_minh'); // Mặc định cho Admin nếu chưa có trí nhớ
      } else if (data.tabs_access && data.tabs_access.length > 0) {
        setActiveTab(data.tabs_access[0]); // Mặc định cho User nếu chưa có trí nhớ
      }
    }
    setIsAuthLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true);
    setActionModal({ isOpen: false, type: '', title: '' }); setActionImage(null);
    setViewMode('list'); 
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) toast.error('Đăng nhập thất bại: Kiểm tra lại tài khoản');
    else toast.success('Đăng nhập thành công!');
    setLoading(false);
  };

  const handleLogout = async () => {
    setActionModal({ isOpen: false, type: '', title: '' }); setActionImage(null);
    await supabase.auth.signOut();
    setViewMode('list');
  };

  // ================= QUẢN TRỊ ADMIN (THÊM, SỬA, XÓA) =================
  const fetchUsersList = async () => {
    const { data, error } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: false });
    if (!error && data) setUsersList(data);
  };

  useEffect(() => { if (viewMode === 'admin' && profile?.role === 'admin') fetchUsersList(); }, [viewMode]);

  const handleToggleTabPermission = (tabId) => {
    if (selectedTabsAccess.includes(tabId)) setSelectedTabsAccess(selectedTabsAccess.filter(id => id !== tabId));
    else setSelectedTabsAccess([...selectedTabsAccess, tabId]);
  };

  const resetAdminForm = () => {
    setEditUserId(null); setNewUserName(''); setNewUserEmail(''); setNewUserPassword('');
    setNewUserRole('user'); setSelectedTabsAccess(['cho_cat', 'da_cat', 'dinh_ky', 'hoan_tat']);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (selectedTabsAccess.length === 0 && newUserRole !== 'admin') return toast.error('Vui lòng cấp ít nhất 1 quyền Tab cho nhân viên');
    setLoading(true);
    const { data: { session: currentAdminSession } } = await supabase.auth.getSession();
    const { data: authData, error: authError } = await supabase.auth.signUp({ email: newUserEmail, password: newUserPassword });
    if (authError) { toast.error('Lỗi tạo tài khoản: ' + authError.message); setLoading(false); return; } 

    if (authData?.user) {
      const accessRights = newUserRole === 'admin' ? ['cho_xac_minh', 'cho_cat', 'da_cat', 'dinh_ky', 'hoan_tat'] : selectedTabsAccess;
      const { error: profileError } = await supabase.from('user_profiles').insert([{ id: authData.user.id, email: newUserEmail, ho_ten: newUserName.trim(), role: newUserRole, tabs_access: accessRights }]);
      if (profileError) toast.error('Lỗi phân quyền: ' + profileError.message);
      else toast.success(`Khởi tạo thành công: ${newUserName.trim()}`);
    }
    if (currentAdminSession) await supabase.auth.setSession(currentAdminSession);
    setAdminView('list'); fetchUsersList(); setLoading(false);
  };

  const openEditUser = (user) => {
    setEditUserId(user.id); setNewUserName(user.ho_ten); setNewUserRole(user.role);
    setSelectedTabsAccess(user.tabs_access || []); setAdminView('edit');
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (selectedTabsAccess.length === 0 && newUserRole !== 'admin') return toast.error('Vui lòng cấp ít nhất 1 quyền Tab');
    setLoading(true);
    const accessRights = newUserRole === 'admin' ? ['cho_xac_minh', 'cho_cat', 'da_cat', 'dinh_ky', 'hoan_tat'] : selectedTabsAccess;
    const { error } = await supabase.from('user_profiles').update({ ho_ten: newUserName.trim(), role: newUserRole, tabs_access: accessRights }).eq('id', editUserId);
    if (error) toast.error('Lỗi cập nhật: ' + error.message);
    else { toast.success('Cập nhật quyền thành công!'); setAdminView('list'); fetchUsersList(); }
    setLoading(false);
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`Xóa vĩnh viễn nhân viên [${userName}]?`)) return;
    setLoading(true);
    const { error } = await supabase.rpc('delete_user_by_admin', { target_user_id: userId });
    if (error) toast.error('Lỗi xóa: ' + error.message); else { toast.success('Đã xóa thành công!'); fetchUsersList(); }
    setLoading(false);
  };

  // ================= LUỒNG NGHIỆP VỤ HỒ SƠ (CÓ ĐỒNG BỘ NGẦM VÀ LỌC 7 NGÀY) =================
  const fetchCustomers = async (isSilent = false) => {
    if (!isSilent) setLoading(true); 
    
    // Tính mốc thời gian 7 ngày trước dưới dạng ISO để nạp vào bộ lọc
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    // Bộ lọc thông minh: Lấy hồ sơ chưa xử lý HOẶC nợ điện kế HOẶC ca mới xong trong 7 ngày
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .or(`trang_thai.in.(cho_xac_minh,cho_cat,da_cat,tro_ngai),chua_thay_dinh_ky.eq.true,created_at.gte.${sevenDaysAgo}`)
      .order('created_at', { ascending: false });
      
    if (!error && data) setCustomers(data);
    if (!isSilent) setLoading(false);
  };

  useEffect(() => { 
    if (!session) return;
    fetchCustomers(); 

    // Bật radar lắng nghe Realtime. Có ai thao tác gì là tự động tải ngầm lại danh sách
    const channel = supabase.channel('realtime_customers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => fetchCustomers(true))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session]);

  // Cập nhật ngầm Bảng Điều Khiển nếu người dùng đang đứng xem chi tiết
  useEffect(() => {
    if (currentId && customers.length > 0) {
      const updatedKh = customers.find(kh => kh.id === currentId);
      if (updatedKh) {
        setCustomerInfo(updatedKh);
        supabase.from('suspension_logs').select('*').eq('customer_id', currentId).order('created_at', { ascending: false })
          .then(({ data, error }) => { if (!error && data) setCustomerLogs(data); });
      }
    }
  }, [customers, currentId]);

  useEffect(() => {
    if (maPE.trim()) {
      const existingKh = customers.find(kh => kh.ma_pe === maPE.trim().toUpperCase());
      if (existingKh) { setTenKH(existingKh.ten_kh || ''); setDiaChi(existingKh.dia_chi || ''); setSoDienThoai(existingKh.so_dien_thoai || ''); } 
      else { setTenKH(''); setDiaChi(''); setSoDienThoai(''); }
    } else { setTenKH(''); setDiaChi(''); setSoDienThoai(''); }
  }, [maPE, customers]);

  const handleSoTienChange = (e) => {
    const rawValue = e.target.value.replace(/\D/g, ''); 
    if (!rawValue) { setSoTienNo(''); return; }
    setSoTienNo(new Intl.NumberFormat('vi-VN').format(rawValue));
  };

  const resetCustomerForm = () => {
    setCurrentId(null); setCustomerInfo(null);
    setMaPE(''); setTenKH(''); setDiaChi(''); setSoDienThoai(''); setSoTienNo(''); setGhiChu('');
    setLyDoNgung('no_cuoc'); setActionImage(null);
  };

  const handleTaoMoi = async (e) => {
    e.preventDefault();
    if (!maPE.trim() || !tenKH.trim()) return toast.error('Vui lòng nhập Mã PE và Họ tên KH');

    // MỤC 1: BẮT BUỘC CÓ ẢNH Ở TAB CHỜ XÁC MINH MỚI CHO LƯU
    if (activeTab === 'cho_xac_minh' && !actionImage) {
      return toast.error('Bắt buộc phải chụp ảnh biên lai/màn hình thanh toán!');
    }

    setLoading(true);
    const standardizedPE = maPE.trim().toUpperCase();
    const existingKh = customers.find(kh => kh.ma_pe === standardizedPE);

    // KIỂM TRA TRÙNG LẶP DỰA TRÊN TAB HIỆN TẠI (KHÔNG CÒN SỬ DỤNG loaiHoSo)
    if (existingKh) {
      if (activeTab !== 'dinh_ky' && ['da_cat', 'cho_xac_minh', 'cho_cat', 'tro_ngai'].includes(existingKh.trang_thai)) {
        toast.error(`Hồ sơ này hiện đang nằm trong luồng Ngưng hơi!`);
        setLoading(false); return;
      } else if (activeTab === 'dinh_ky' && existingKh.chua_thay_dinh_ky) {
        toast.error(`Hồ sơ đã tồn tại bên danh sách Nợ thay điện kế!`);
        setLoading(false); return;
      }
    }

    let newData = { ma_pe: standardizedPE, ten_kh: tenKH.trim(), dia_chi: diaChi.trim(), so_dien_thoai: soDienThoai.trim(), ghi_chu: ghiChu.trim() };
    let logContent = '';

    // ÉP DỮ LIỆU ĐI THEO ĐÚNG TAB ĐANG ĐỨNG KHI BẤM THÊM MỚI
    if (activeTab === 'dinh_ky') {
      newData.chua_thay_dinh_ky = true;
      if (!existingKh) newData.trang_thai = 'dang_su_dung';
      logContent = `Khởi tạo: Nợ thay điện kế (Bởi ${profile?.ho_ten})`;
    } else {
      newData.trang_thai = activeTab === 'hoan_tat' ? 'cho_xac_minh' : activeTab;
      
      const currentLyDo = activeTab === 'da_cat' ? lyDoNgung : 'no_cuoc';
      newData.ly_do_ngung = currentLyDo; 
      newData.so_tien_no = (currentLyDo === 'no_cuoc' && soTienNo) ? parseInt(soTienNo.replace(/\./g, ''), 10) : 0;
      
      let txtLyDo = currentLyDo === 'no_cuoc' ? 'Nợ tiền điện' : currentLyDo === 'kh_yeu_cau' ? 'KH yêu cầu' : 'Phát hiện bất thường';

      if (activeTab === 'da_cat') {
        newData.ngay_cat = new Date().toISOString();
        logContent = `Khởi tạo: Đã cắt thực tế (Lý do: ${txtLyDo}${currentLyDo === 'no_cuoc' ? ` - ${newData.so_tien_no.toLocaleString('vi-VN')}đ` : ''}) - Lập bởi ${profile?.ho_ten}`;
      } else if (activeTab === 'cho_cat') {
        logContent = `Khởi tạo: Lệnh chờ cắt điện (Nợ cước: ${newData.so_tien_no.toLocaleString('vi-VN')}đ) - Lập bởi ${profile?.ho_ten}`;
      } else {
        logContent = `Khởi tạo: Chờ VP xác minh thu tiền (Nợ cước: ${newData.so_tien_no.toLocaleString('vi-VN')}đ) - Lập bởi ${profile?.ho_ten}`;
      }
    }

    // MỤC 1: XỬ LÝ NÉN VÀ ĐẨY ẢNH LÊN MÁY CHỦ NẾU CÓ ẢNH
    let finalImageUrl = null;
    if (actionImage) {
      toast.loading('Đang tải ảnh minh chứng...', { id: 'uploadToast' });
      try {
        const compressedBlob = await compressImage(actionImage);
        const fileName = `PE-${standardizedPE}-${Date.now()}.jpg`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from('evn_images').upload(fileName, compressedBlob);
        if (uploadError) throw uploadError;
        if (uploadData) finalImageUrl = supabase.storage.from('evn_images').getPublicUrl(fileName).data.publicUrl;
      } catch (err) {
        console.warn('Lỗi ảnh:', err);
      }
      toast.dismiss('uploadToast');
    }

    let resultData, resultError;
    if (existingKh) {
      const { data, error } = await supabase.from('customers').update(newData).eq('id', existingKh.id).select();
      resultData = data;
      resultError = error;
    } else {
      const { data, error } = await supabase.from('customers').insert([newData]).select();
      resultData = data; resultError = error;
    }

    if (resultError) toast.error('Lỗi: ' + resultError.message);
    else if (resultData && resultData.length > 0) {
      // Gắn luôn đường link ảnh vào Lịch sử (Timeline)
      await supabase.from('suspension_logs').insert([{ customer_id: resultData[0].id, hanh_dong: 'Tạo/Cập nhật', noi_dung: logContent, image_url: finalImageUrl }]);
      toast.success('Ghi nhận thành công!'); resetCustomerForm(); fetchCustomers(true); setViewMode('list'); 
    }
    setLoading(false);
  };

  const loadToProcess = async (kh) => {
    setCurrentId(kh.id); setCustomerInfo(kh); setViewMode('process'); window.scrollTo({ top: 0, behavior: 'smooth' });
    const { data, error } = await supabase.from('suspension_logs').select('*').eq('customer_id', kh.id).order('created_at', { ascending: false });
    setCustomerLogs(!error && data ? data : []);
  };

  const openActionModal = (type, title) => {
    const tzOffset = new Date().getTimezoneOffset() * 60000;
    setActionDate(new Date(Date.now() - tzOffset).toISOString().slice(0, 16));
    setActionNote(''); setActionImage(null); setActionModal({ isOpen: true, type, title });
  };
  const closeActionModal = () => { setActionModal({ isOpen: false, type: '', title: '' }); setActionImage(null); };

  const handleConfirmAction = async (e) => {
    e.preventDefault(); setLoading(true);
    let updateData = {}; let logAction = ''; let logContent = '';
    const isoDate = new Date(actionDate).toISOString(); 
    let finalImageUrl = null;
    let gpsCoords = null; // Biến trữ tọa độ mới

    // LẤY GPS VÀ NÉN ẢNH KHI BẤM CẮT ĐIỆN
    if (actionModal.type === 'ht_da_cat') {
      toast.loading('Đang ghi nhận tọa độ GPS...', { id: 'gpsToast' });
      gpsCoords = await getCurrentLocation(); // Định vị ngầm
      toast.dismiss('gpsToast');

      if (actionImage) {
        try {
          const compressedBlob = await compressImage(actionImage);
          const fileName = `${currentId}-${Date.now()}.jpg`;
          const { data: uploadData, error: uploadError } = await supabase.storage.from('evn_images').upload(fileName, compressedBlob);
          if (uploadError) throw uploadError;
          if (uploadData) finalImageUrl = supabase.storage.from('evn_images').getPublicUrl(fileName).data.publicUrl;
        } catch (err) {
          toast.error('Lỗi tải ảnh, nhưng hồ sơ vẫn sẽ lưu!');
        }
      }
    }

    switch(actionModal.type) {
      case 'vp_xac_minh_ok':
        updateData = { trang_thai: 'dang_su_dung', so_tien_no: 0, da_thanh_toan: true, ngay_thanh_toan: isoDate };
        logAction = 'Xác minh: OK'; logContent = `Đã thu tiền - Gạch nợ (Bởi ${profile?.ho_ten})`; break;
      case 'vp_yeu_cau_cat':
        updateData = { trang_thai: 'cho_cat' }; logAction = 'Xác minh: Thất bại'; logContent = `Từ chối hoãn. Chỉ thị cắt điện (Bởi ${profile?.ho_ten})`; break;
      
      case 'ht_da_cat':
        updateData = { trang_thai: 'da_cat', ngay_cat: isoDate }; 
        if (gpsCoords) { // Nếu lấy được tọa độ thì nhét vào Database
          updateData.vi_do = gpsCoords.lat.toString();
          updateData.kinh_do = gpsCoords.lng.toString();
        }
        logAction = 'Ngưng hơi'; 
        logContent = `Đã cắt điện thực tế lúc ${new Date(actionDate).toLocaleString('vi-VN')} (Bởi: ${profile?.ho_ten}). ${finalImageUrl ? '[Kèm hình ảnh]' : ''} ${gpsCoords ? '📍[Đã cắm chốt GPS]' : ''}`; break;
      
      case 'ht_tro_ngai': {
        // VÁ ĐIỂM NGHẼN SỐ 3: Đếm số lần báo trở ngại
        const soLanMoi = (customerInfo?.so_lan_tro_ngai || 0) + 1;
        updateData = { trang_thai: 'tro_ngai', ghi_chu: actionNote, so_lan_tro_ngai: soLanMoi }; 
        logAction = `Báo trở ngại (Lần ${soLanMoi})`; 
        logContent = `Lý do: ${actionNote} (Bởi: ${profile?.ho_ten})`; 
        break;
      }
      case 'vp_kich_hoat_lai': 
        updateData = { trang_thai: 'cho_cat', ghi_chu: '' }; logAction = 'Tái lệnh'; logContent = `Khôi phục lệnh ngừng cấp điện (Bởi: ${profile?.ho_ten})`; break;
      case 'da_de_dien':
        updateData = { trang_thai: 'da_de_dien', ngay_de_dien: isoDate }; logAction = 'Đóng điện'; logContent = `Khôi phục điện thành công (Bởi: ${profile?.ho_ten})`; break;
      case 'thu_tien_no':
        updateData = { so_tien_no: 0, da_thanh_toan: true, ngay_thanh_toan: isoDate }; logAction = 'Xóa nợ'; logContent = `Đã đóng tiền cước (Bởi: ${profile?.ho_ten})`; break;
      case 'thay_dinh_ky':
        updateData = { chua_thay_dinh_ky: false, da_thay_dinh_ky: true, ngay_thay_dinh_ky: isoDate }; logAction = 'Thay điện kế'; logContent = `Hoàn tất thay ĐK định kỳ (Bởi: ${profile?.ho_ten})`; break;
      default: break;
    }

    const { error } = await supabase.from('customers').update(updateData).eq('id', currentId);
    if (!error) {
      await supabase.from('suspension_logs').insert([{ customer_id: currentId, hanh_dong: logAction, noi_dung: logContent, image_url: finalImageUrl }]);
      toast.success(actionModal.title + ' thành công!'); fetchCustomers(true); closeActionModal(); setViewMode('list'); 
    } else toast.error('Gặp lỗi thao tác: ' + error.message);
    setLoading(false);
  };

  const filteredCustomers = customers.filter(kh => {
    const matchSearch = kh.ma_pe.toLowerCase().includes(searchTerm.toLowerCase()) || kh.ten_kh.toLowerCase().includes(searchTerm.toLowerCase());
    if (activeTab === 'cho_xac_minh') return matchSearch && kh.trang_thai === 'cho_xac_minh';
    if (activeTab === 'cho_cat') return matchSearch && (kh.trang_thai === 'cho_cat' || kh.trang_thai === 'tro_ngai'); 
    if (activeTab === 'da_cat') return matchSearch && kh.trang_thai === 'da_cat';
    if (activeTab === 'dinh_ky') return matchSearch && kh.chua_thay_dinh_ky === true;
    if (activeTab === 'hoan_tat') {
      const isDoneNgungHoi = kh.trang_thai === 'da_de_dien';
      const isDoneDinhKy = kh.da_thay_dinh_ky === true && kh.chua_thay_dinh_ky === false;
      return matchSearch && (isDoneNgungHoi || (isDoneDinhKy && ['dang_su_dung','cho_xac_minh'].includes(kh.trang_thai)));
    }
    return false;
  }).sort((a, b) => {
    if (activeTab === 'da_cat') {
      const aReady = a.so_tien_no === 0 && !a.chua_thay_dinh_ky;
      const bReady = b.so_tien_no === 0 && !b.chua_thay_dinh_ky;
      if (aReady && !bReady) return -1;
      if (!aReady && bReady) return 1;
    }
    return 0; 
  });

  if (isAuthLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-100"><i className="fa-solid fa-spinner fa-spin text-3xl text-blue-600"></i></div>;

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="bg-blue-600 w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-3 shadow-lg"><i className="fa-solid fa-bolt text-2xl text-white"></i></div>
            <h1 className="text-xl font-bold text-slate-800 uppercase tracking-wide">Điện Lực Châu Phú</h1>
            <p className="text-xs text-slate-500 mt-1">Hệ thống điều hành hiện trường</p>
          </div>
          <div className="space-y-4">
            <div className="relative"><i className="fa-solid fa-envelope absolute left-3 top-3.5 text-slate-400"></i><input type="email" value={authEmail} onChange={(e)=>setAuthEmail(e.target.value)} className="w-full pl-9 pr-3 py-3 border border-slate-300 rounded-lg text-sm outline-none" placeholder="Email nội bộ" required /></div>
            <div className="relative"><i className="fa-solid fa-lock absolute left-3 top-3.5 text-slate-400"></i><input type="password" value={authPassword} onChange={(e)=>setAuthPassword(e.target.value)} className="w-full pl-9 pr-3 py-3 border border-slate-300 rounded-lg text-sm outline-none" placeholder="Mật khẩu" required /></div>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg text-sm shadow-md">{loading ? <i className="fa-solid fa-spinner fa-spin"></i> : 'ĐĂNG NHẬP'}</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-slate-100 min-h-screen text-slate-800 font-sans pb-24 relative">
      <div className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {viewMode !== 'list' && <button onClick={() => setViewMode('list')} className="p-2 hover:bg-blue-700 rounded-full transition-colors"><i className="fa-solid fa-arrow-left text-lg"></i></button>}
          <div className="bg-white/20 p-2 rounded-lg"><i className="fa-solid fa-user-shield text-base text-white"></i></div>
          <div>
            <h1 className="text-sm font-bold leading-tight truncate max-w-[150px]">{profile?.ho_ten || 'Nhân viên'}</h1>
            <p className="text-[10px] text-blue-200 font-medium uppercase tracking-wider">{profile?.role === 'admin' ? 'Quản trị viên' : 'Nhân viên điều hành'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {profile?.role === 'admin' && viewMode === 'list' && (
            <button onClick={() => setViewMode('admin')} className="bg-amber-500 hover:bg-amber-600 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5"><i className="fa-solid fa-users-gear"></i> Quyền</button>
          )}
          <button onClick={handleLogout} className="bg-white/20 hover:bg-white/30 px-2.5 py-1.5 rounded-lg text-xs font-bold"><i className="fa-solid fa-right-from-bracket"></i></button>
        </div>
      </div>

      <div className="p-4">
        {/* ================= KHU VỰC QUẢN TRỊ ADMIN ================= */}
        {viewMode === 'admin' && profile?.role === 'admin' && (
          <div className="fade-in space-y-4">
            <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1.5 gap-1">
              <button onClick={() => setAdminView('list')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${adminView === 'list' ? 'bg-amber-500 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}><i className="fa-solid fa-list-ul mr-1.5"></i> Danh sách NV</button>
              <button onClick={() => { setAdminView('create'); resetAdminForm(); }} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${adminView === 'create' ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}><i className="fa-solid fa-user-plus mr-1.5"></i> Cấp tài khoản</button>
            </div>

            {adminView === 'list' && (
              <div className="space-y-3 fade-in">
                {usersList.map((user) => (
                  <div key={user.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${user.role === 'admin' ? 'bg-amber-500' : 'bg-blue-500'}`}></div>
                    <div className="flex justify-between items-start mb-2 pl-2">
                      <div><h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">{user.role === 'admin' ? <i className="fa-solid fa-star text-amber-500 text-[10px]"></i> : <i className="fa-solid fa-user text-blue-500 text-[10px]"></i>}{user.ho_ten}</h4><p className="text-xs text-slate-500 mt-0.5">{user.email}</p></div>
                      <span className={`text-[9px] font-bold px-2 py-1 rounded uppercase tracking-wider border ${user.role === 'admin' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{user.role === 'admin' ? 'Admin' : 'Nhân viên'}</span>
                    </div>
                    {user.role === 'user' && (
                      <div className="pl-2 mt-2 pt-2 border-t border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Quyền truy cập Tab:</p>
                        <div className="flex flex-wrap gap-1">
                          {user.tabs_access && user.tabs_access.length > 0 ? user.tabs_access.map(tab => (
                            <span key={tab} className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded border border-slate-200">{ALL_SYSTEM_TABS.find(t=>t.id===tab)?.name || tab}</span>
                          )) : <span className="text-[10px] text-red-500 italic">Chưa cấp quyền nào</span>}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 mt-4 pl-2">
                      <button onClick={() => openEditUser(user)} className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold py-2 rounded-lg text-xs transition-colors"><i className="fa-solid fa-pen-to-square mr-1"></i> Sửa</button>
                      <button onClick={() => handleDeleteUser(user.id, user.ho_ten)} disabled={user.id === profile?.id} className={`flex-1 font-bold py-2 rounded-lg text-xs border transition-colors ${user.id === profile?.id ? 'bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed' : 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'}`}><i className="fa-solid fa-trash-can mr-1"></i> Xóa</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(adminView === 'create' || adminView === 'edit') && (
              <form onSubmit={adminView === 'create' ? handleCreateUser : handleUpdateUser} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4 fade-in">
                <h3 className="font-bold text-slate-800 border-b pb-2 text-sm uppercase tracking-wide text-blue-700">{adminView === 'create' ? <><i className="fa-solid fa-user-plus mr-2"></i>Cấp tài khoản mới</> : <><i className="fa-solid fa-pen-to-square mr-2"></i>Sửa quyền nhân viên</>}</h3>
                <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Họ Tên Nhân Viên</label><input type="text" value={newUserName} onChange={e=>setNewUserName(e.target.value)} required className="w-full p-2.5 text-sm border border-slate-300 rounded-lg outline-none" /></div>
                {adminView === 'create' && (
                  <>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email đăng nhập</label><input type="email" value={newUserEmail} onChange={e=>setNewUserEmail(e.target.value)} required className="w-full p-2.5 text-sm border border-slate-300 rounded-lg outline-none" /></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mật khẩu khởi tạo</label><input type="text" value={newUserPassword} onChange={e=>setNewUserPassword(e.target.value)} required className="w-full p-2.5 text-sm border border-slate-300 rounded-lg outline-none" placeholder="Nhập ít nhất 6 ký tự"/></div>
                  </>
                )}
                <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Phân cấp vai trò</label><select value={newUserRole} onChange={e=>setNewUserRole(e.target.value)} className="w-full p-2.5 text-sm border border-slate-300 rounded-lg outline-none font-bold text-blue-700 bg-blue-50/50"><option value="user">Nhân viên thông thường (User)</option><option value="admin">Quản trị viên toàn quyền (Admin)</option></select></div>
                {newUserRole === 'user' && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 fade-in">
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Tích chọn Tab cho phép truy cập:</label>
                    {ALL_SYSTEM_TABS.map(tab => (
                      <label key={tab.id} className="flex items-center gap-3 p-2 bg-white border border-slate-200 rounded-lg cursor-pointer select-none text-sm font-semibold hover:bg-slate-50"><input type="checkbox" checked={selectedTabsAccess.includes(tab.id)} onChange={() => handleToggleTabPermission(tab.id)} className="w-4 h-4 text-blue-600 rounded" /><span className="flex items-center gap-2"><i className={`fa-solid ${tab.icon} text-slate-400 w-4 text-center`}></i> Tab {tab.name}</span></label>
                    ))}
                  </div>
                )}
                <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-sm shadow-md transition-all">{loading ? <i className="fa-solid fa-spinner fa-spin"></i> : (adminView === 'create' ? 'KHỞI TẠO TÀI KHOẢN' : 'LƯU THAY ĐỔI QUYỀN')}</button>
              </form>
            )}
          </div>
        )}

        {/* ================= GIAO DIỆN HỒ SƠ CHÍNH ================= */}
        {viewMode === 'list' && (
          <div className="fade-in space-y-4">
            {/* Thanh Tab đã bỏ cuộn ngang, dàn đều width và xếp chồng Icon/Text */}
            <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1 gap-1 w-full justify-between">
              {ALL_SYSTEM_TABS.map(tab => {
                const hasAccess = profile?.role === 'admin' || profile?.tabs_access?.includes(tab.id);
                if (!hasAccess) return null;
                let badgeCount = 0;
                if (tab.id === 'cho_xac_minh') badgeCount = customers.filter(k => k.trang_thai === 'cho_xac_minh').length;
                if (tab.id === 'cho_cat') badgeCount = customers.filter(k => k.trang_thai === 'cho_cat' || k.trang_thai === 'tro_ngai').length;
                
                return (
                  <button 
                    key={tab.id} 
                    onClick={() => setActiveTab(tab.id)} 
                    className={`relative flex-1 flex flex-col items-center justify-center py-2 px-0.5 rounded-lg transition-all ${activeTab === tab.id ? `${tab.color} text-white shadow-sm` : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    <i className={`fa-solid ${tab.icon} text-sm mb-1`}></i>
                    <span className="text-[9px] font-bold text-center leading-none whitespace-nowrap">{tab.name}</span>
                    
                    {/* Bọt thông báo (Badge) được đẩy lên góc phải của Tab */}
                    {badgeCount > 0 && (
                      <span className="absolute top-0.5 right-1 bg-red-500 text-white w-3.5 h-3.5 flex items-center justify-center rounded-full text-[8px] font-black shadow-sm border border-white">
                        {badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <div className="flex gap-2">
                <div className="relative flex-1"><i className="fa-solid fa-magnifying-glass absolute left-3 top-3.5 text-slate-400"></i><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Nhập Sổ GCS, Trạm, PE..." className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"/></div>
                <button onClick={() => setViewMode('map')} className="bg-emerald-50 border border-emerald-300 text-emerald-600 px-4 py-2.5 rounded-lg hover:bg-emerald-100 transition-colors shadow-sm"><i className="fa-solid fa-map-location-dot"></i></button>
                <button onClick={() => fetchCustomers()} className="bg-slate-100 border border-slate-300 text-slate-600 px-4 py-2.5 rounded-lg hover:bg-slate-200 transition-colors shadow-sm"><i className="fa-solid fa-rotate"></i></button>
              </div>
            </div>

            <div className="space-y-2"> {/* Ép nhẹ khoảng cách thẻ lại để hiển thị nhiều dòng hơn */}
              {filteredCustomers.map((kh) => {
                // Điều kiện bật đèn xanh: Cắt điện + Do nợ cước + Đã trả hết tiền
                const isReadyToReconnect = kh.trang_thai === 'da_cat' && kh.ly_do_ngung === 'no_cuoc' && kh.so_tien_no === 0 && !kh.chua_thay_dinh_ky;
                
                // Rút gọn text Lý do để hiển thị trên Thẻ
                let txtLyDoNgan = kh.ly_do_ngung === 'no_cuoc' ? 'Nợ cước' : kh.ly_do_ngung === 'kh_yeu_cau' ? 'Yêu cầu KH' : 'Vi phạm';

                return (
                <div key={kh.id} onClick={() => loadToProcess(kh)} className={`p-2.5 rounded-xl shadow-sm border hover:border-blue-400 hover:shadow-md active:scale-[0.98] transition-all cursor-pointer relative overflow-hidden group flex items-stretch bg-white ${kh.trang_thai === 'tro_ngai' ? 'opacity-90 border-slate-200' : isReadyToReconnect ? 'bg-green-50/40 border-green-200 ring-1 ring-green-400' : 'border-slate-200'}`}>
                  
                  {/* CỘT TRÁI CÙNG: Dải màu định vị Trạng thái */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${kh.trang_thai === 'cho_xac_minh' ? 'bg-indigo-500' : kh.trang_thai === 'cho_cat' ? 'bg-orange-500' : kh.trang_thai === 'tro_ngai' ? 'bg-purple-500' : kh.trang_thai === 'da_cat' ? (isReadyToReconnect ? 'bg-green-500' : 'bg-red-500') : kh.chua_thay_dinh_ky ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                  
                  {/* KHU VỰC TRUNG TÂM: Lưới hiển thị thông tin */}
                  <div className="pl-2.5 flex-1 min-w-0 flex flex-col justify-center">
                    
                    {/* DÒNG 1: Mã PE (Trái) - Trạng thái (Phải) */}
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-mono font-bold text-xs bg-slate-100 px-1.5 py-0.5 rounded text-blue-700 border border-slate-200 tracking-tight">{kh.ma_pe}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${kh.trang_thai === 'cho_xac_minh' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : kh.trang_thai === 'cho_cat' ? 'bg-orange-50 text-orange-700 border-orange-200 animate-pulse' : kh.trang_thai === 'tro_ngai' ? 'bg-purple-50 text-purple-700 border-purple-200' : kh.trang_thai === 'da_cat' ? (isReadyToReconnect ? 'bg-green-600 text-white border-green-700 shadow-sm' : 'bg-red-50 text-red-700 border-red-200') : activeTab === 'hoan_tat' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {kh.trang_thai === 'cho_xac_minh' ? 'Chờ xác minh' : kh.trang_thai === 'cho_cat' ? 'Bắt buộc cắt' : kh.trang_thai === 'tro_ngai' ? `⚠️ Trở ngại ${kh.so_lan_tro_ngai > 0 ? `(Lần ${kh.so_lan_tro_ngai})` : ''}` : kh.trang_thai === 'da_cat' ? (isReadyToReconnect ? '🟢 Sẵn mở điện' : 'Đã ngưng hơi') : activeTab === 'hoan_tat' ? 'Hoàn tất' : 'Nợ điện kế'}
                      </span>
                    </div>
                    
                    {/* DÒNG 2: Tên Khách Hàng (Tô đậm) */}
                    <h4 className={`font-bold text-[13px] leading-tight mb-1 truncate pr-2 ${kh.trang_thai === 'tro_ngai' ? 'text-slate-500 line-through decoration-1' : 'text-slate-800'}`}>{kh.ten_kh}</h4>
                    
                    {/* DÒNG 3: Địa chỉ (Trải dài hết chiều ngang) */}
                    {kh.dia_chi && (
                      <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5 mb-1">
                        <i className="fa-solid fa-location-dot w-3 text-center text-slate-400"></i><span className="truncate">{kh.dia_chi}</span>
                      </div>
                    )}

                    {/* DÒNG 4: Số điện thoại (Trái) & Số Tiền Nợ (Phải) */}
                    <div className="flex justify-between items-center text-[11px] mb-1">
                      <div className="text-blue-600 font-bold flex items-center gap-1.5 truncate">
                        {kh.so_dien_thoai ? <><i className="fa-solid fa-phone w-3 text-center text-slate-400"></i>{kh.so_dien_thoai}</> : <span className="text-slate-300 italic"><i className="fa-solid fa-phone-slash w-3 text-center"></i>Không có SĐT</span>}
                      </div>
                      <div className="font-bold pr-1 shrink-0 flex items-center gap-1.5">
                        {kh.so_tien_no > 0 && (
                          <span className="text-rose-600"><i className="fa-solid fa-sack-dollar mr-1 text-rose-400"></i>{kh.so_tien_no.toLocaleString('vi-VN')}đ</span>
                        )}
                        {kh.chua_thay_dinh_ky && (
                          <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-300 text-[9px] uppercase"><i className="fa-solid fa-screwdriver-wrench"></i> Nợ ĐK</span>
                        )}
                      </div>
                    </div>

                    {/* DÒNG 5 (Chỉ hiển thị với hồ sơ Đã Cắt): Thời gian cắt (Trái) & Lý do (Phải) */}
                    {kh.trang_thai === 'da_cat' && (
                      <div className="flex justify-between items-center text-[11px] mt-0.5">
                        <div className="text-slate-500 font-medium flex items-center gap-1.5">
                           <i className="fa-solid fa-clock-rotate-left w-3 text-center text-slate-400"></i>
                           {kh.ngay_cat ? `Cắt lúc: ${new Date(kh.ngay_cat).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}` : 'Chưa cập nhật giờ'}
                        </div>
                        <div className="text-slate-500 font-bold pr-1 shrink-0">
                           <i className="fa-solid fa-tag mr-1 text-slate-400"></i>{txtLyDoNgan}
                        </div>
                      </div>
                    )}

                    {/* DÒNG CUỐI: Ghi chú (Nếu có sẽ tự động đóng khung xám bọc lại) */}
                    {kh.ghi_chu && (
                      <div className={`mt-1.5 rounded p-1.5 text-[10px] font-medium italic leading-snug border-l-2 ${kh.trang_thai === 'tro_ngai' ? 'bg-purple-50 text-purple-700 border-purple-300' : 'bg-slate-50 text-slate-500 border-slate-300'}`}>
                        {kh.ghi_chu}
                      </div>
                    )}
                  </div>
                  
                  {/* CỘT PHẢI CÙNG: Mũi tên định hướng tương tác */}
                  <div className="pl-1 flex items-center text-slate-300 group-hover:text-blue-500 transition-colors">
                    <i className="fa-solid fa-chevron-right text-sm"></i>
                  </div>
                  
                </div>
                );
              })}
              {filteredCustomers.length === 0 && <div className="text-center py-16 text-slate-400 font-medium text-sm bg-white rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-3"><div className="bg-slate-50 p-3 rounded-full"><i className="fa-solid fa-folder-open text-3xl text-slate-300"></i></div><p>Không có hồ sơ nào thuộc danh mục này.</p></div>}
            </div>

          </div>
        )}

        {/* GIAO DIỆN FORM TẠO MỚI */}
        {viewMode === 'add' && (
          <>
          <form id="form-tao-moi" onSubmit={handleTaoMoi} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden fade-in mb-24">
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200"><h2 className="font-bold text-slate-800 flex items-center gap-2"><i className="fa-solid fa-file-circle-plus text-blue-600"></i> Khởi Tạo Hồ Sơ Mới</h2></div>
            <div className="p-5 space-y-4">
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mã số PE Khách hàng *</label><div className="relative"><i className="fa-solid fa-hashtag absolute left-3 top-3.5 text-slate-400"></i><input type="text" value={maPE} onChange={(e) => setMaPE(e.target.value.toUpperCase())} placeholder="VD: PB1207..." className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 outline-none transition-all" required /></div></div>
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Họ và tên Khách hàng *</label><div className="relative"><i className="fa-solid fa-user absolute left-3 top-3.5 text-slate-400"></i><input type="text" value={tenKH} onChange={(e) => setTenKH(e.target.value)} placeholder="Tên hiển thị công tơ..." className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" required /></div></div>
              <div className="grid grid-cols-2 gap-3">
                 <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Số điện thoại</label><div className="relative"><i className="fa-solid fa-phone absolute left-3 top-3.5 text-slate-400"></i><input type="tel" inputMode="numeric" pattern="[0-9]*" value={soDienThoai} onChange={(e) => setSoDienThoai(e.target.value)} className="w-full pl-9 pr-3 py-2.5 border border-slate-300 text-sm rounded-lg outline-none" /></div></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Địa bàn / Địa chỉ</label><div className="relative"><i className="fa-solid fa-location-dot absolute left-3 top-3.5 text-slate-400"></i><input type="text" value={diaChi} onChange={(e) => setDiaChi(e.target.value)} className="w-full pl-9 pr-3 py-2.5 border border-slate-300 text-sm rounded-lg outline-none" /></div></div>
              </div>
              <div className="pt-4 mt-2 border-t border-slate-100 fade-in space-y-3">
                 {/* Thẻ ghim thông báo ngữ cảnh */}
                 <div className="bg-blue-50/80 p-3 rounded-xl border border-blue-200 flex gap-3 items-center">
                   <i className="fa-solid fa-thumbtack text-blue-500 text-base"></i>
                   <div>
                     <p className="text-[10px] text-blue-600 font-bold uppercase mb-0.5">Chế độ tạo hồ sơ:</p>
                     <p className="text-xs text-blue-900 font-black uppercase">
                       {activeTab === 'dinh_ky' ? 'Nợ Thay Điện Kế Định Kỳ' :
                        activeTab === 'cho_cat' ? 'Lệnh Chờ Cắt Điện' :
                        activeTab === 'da_cat' ? 'Đã Cắt Điện Thực Tế' : 'Chờ Văn Phòng Xác Minh'}
                     </p>
                   </div>
                 </div>

                 {/* DIỆN 1: CHỈ XUẤT HIỆN KHI Ở TAB "ĐÃ CẮT" (CÓ LỰA CHỌN NGUYÊN NHÂN) */}
                 {activeTab === 'da_cat' && (
                   <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                     <div>
                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Nguyên nhân đã cắt điện:</label>
                       <select 
                         value={lyDoNgung} 
                         onChange={(e) => setLyDoNgung(e.target.value)}
                         className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold text-rose-700 bg-white outline-none"
                       >
                         <option value="no_cuoc">Nợ tiền điện (Thu cước)</option>
                         <option value="kh_yeu_cau">Khách hàng yêu cầu tạm ngưng</option>
                         <option value="bat_thuong">Phát hiện bất thường / Vi phạm</option>
                       </select>
                     </div>

                     {lyDoNgung === 'no_cuoc' && (
                       <div className="pt-2 border-t border-slate-200 fade-in">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tổng số tiền nợ (VNĐ)</label>
                          <div className="relative"><i className="fa-solid fa-money-bill-wave absolute left-3 top-3 text-slate-400"></i><input type="text" inputMode="numeric" value={soTienNo} onChange={handleSoTienChange} placeholder="Nhập số tiền..." className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 bg-white" /></div>
                       </div>
                     )}
                   </div>
                 )}

                 {/* DIỆN 2: KHI Ở TAB CHỜ CẮT HOẶC XÁC MINH (ẨN DROPDOWN, HIỆN THẲNG Ô NHẬP TIỀN) */}
                 {['cho_xac_minh', 'cho_cat', 'hoan_tat'].includes(activeTab) && (
                   <div className="space-y-3">
                     <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tổng số tiền nợ cước (VNĐ) *</label>
                        <div className="relative"><i className="fa-solid fa-money-bill-wave absolute left-3 top-3 text-slate-400"></i><input type="text" inputMode="numeric" value={soTienNo} onChange={handleSoTienChange} placeholder="Nhập số tiền cước bắt buộc..." className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 bg-white" required /></div>
                     </div>

                     {/* BỔ SUNG MỤC 1: ÉP CHỤP ẢNH BIÊN LAI NẾU LÀ TAB CHỜ XÁC MINH */}
                     {activeTab === 'cho_xac_minh' && (
                       <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-200 fade-in">
                          <label className="block text-xs font-bold text-blue-700 uppercase mb-2">📸 Ảnh biên lai / GD thành công *</label>
                          {!actionImage ? (
                            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-blue-300 rounded-xl cursor-pointer hover:bg-blue-100 bg-white transition-colors shadow-sm">
                              <div className="flex flex-col items-center justify-center pt-5 pb-6 text-blue-500">
                                <i className="fa-solid fa-camera text-2xl mb-1"></i><p className="text-[10px] font-bold uppercase tracking-wider">Bấm để chụp màn hình CK</p>
                              </div>
                              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if(e.target.files && e.target.files[0]) setActionImage(e.target.files[0]); }} />
                            </label>
                          ) : (
                            <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm group">
                              <img src={URL.createObjectURL(actionImage)} alt="Preview" className="w-full h-32 object-cover" />
                              <button type="button" onClick={() => setActionImage(null)} className="absolute top-2 right-2 bg-rose-500/90 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-rose-600 border-2 border-white shadow-lg transition-colors"><i className="fa-solid fa-xmark"></i></button>
                            </div>
                          )}
                       </div>
                     )}
                   </div>
                 )}
              </div>
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nội dung ghi chú hiện trường</label><textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} rows="2" placeholder="VD: Khách trình bill Agribank thanh toán lúc 08h30..." className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"></textarea></div>
            </div>
          </form> {/* <--- FORM ĐÓNG LẠI Ở ĐÂY ĐỂ CẮT ĐỨT ANIMATION GIẬT LAG */}

          {/* THANH NÚT BẤM LƯU HỒ SƠ (Được nâng lên bottom-16 để ngồi ngay trên thanh Menu) */}
          <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-md p-4 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-[50] fade-in">
            <div className="flex gap-3">
              <button type="button" onClick={() => setViewMode('list')} className="w-1/3 bg-slate-100 text-slate-700 font-bold py-3.5 rounded-lg text-sm uppercase tracking-wider">HỦY</button>
              <button type="submit" form="form-tao-moi" disabled={loading} className="w-2/3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg shadow-lg flex justify-center items-center gap-2 text-sm uppercase tracking-wider">{loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-paper-plane"></i>} LƯU HỒ SƠ</button>
            </div>
          </div>
          </>
        )}

        {/* MÀN HÌNH BẢNG ĐIỀU KHIỂN CHI TIẾT HỒ SƠ */}
        {viewMode === 'process' && (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden fade-in">
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between"><h3 className="font-bold text-slate-800 flex items-center gap-2"><i className="fa-solid fa-microchip text-blue-600"></i> Bảng Điều Khiển Nghiệp Vụ</h3></div>
            <div className="p-5">
              <div className="mb-5 text-center border-b border-slate-100 pb-5">
                <h3 className="text-xl font-bold text-slate-800 mb-1">{customerInfo?.ten_kh}</h3>
                <div className="flex justify-center mb-2"><span className="inline-flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-lg font-mono font-bold text-blue-700 border border-blue-200 text-xs"><i className="fa-solid fa-hashtag"></i> {customerInfo?.ma_pe}</span></div>
                <div className="flex flex-col items-center justify-center gap-1 text-xs text-slate-500">
                  {customerInfo?.so_dien_thoai && <p>SĐT: <span className="font-bold text-blue-600">{customerInfo?.so_dien_thoai}</span></p>}
                  {customerInfo?.dia_chi && <p><i className="fa-solid fa-location-dot mr-1"></i>{customerInfo?.dia_chi}</p>}
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold"><i className="fa-solid fa-power-off mr-1 w-4 text-center"></i> Lưới điện hiện tại:</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded border ${customerInfo?.trang_thai === 'cho_xac_minh' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : customerInfo?.trang_thai === 'cho_cat' ? 'bg-orange-100 text-orange-700 border-orange-200' : customerInfo?.trang_thai === 'tro_ngai' ? 'bg-purple-100 text-purple-700 border-purple-200' : customerInfo?.trang_thai === 'da_cat' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
                     {customerInfo?.trang_thai === 'cho_xac_minh' ? 'Hoãn - Chờ xác minh' : customerInfo?.trang_thai === 'cho_cat' ? 'Chờ ngưng hơi' : customerInfo?.trang_thai === 'tro_ngai' ? 'Tạm dừng do Trở ngại' : customerInfo?.trang_thai === 'da_cat' ? 'Đã ngưng hơi' : 'Đang sử dụng'}
                  </span>
                </div>
                {customerInfo?.so_tien_no > 0 && <div className="flex justify-between items-center border-t border-slate-200 pt-2"><span className="text-slate-500 font-semibold"><i className="fa-solid fa-wallet mr-1 w-4 text-center"></i> Số tiền nợ cước:</span><span className="font-bold text-red-600 bg-white px-2 py-0.5 rounded border border-red-100">{customerInfo.so_tien_no.toLocaleString('vi-VN')} đ</span></div>}
              </div>

              {/* CẢNH BÁO NHIỆM VỤ KÉP */}
              {customerInfo?.trang_thai === 'da_cat' && customerInfo?.chua_thay_dinh_ky && (
                <div className="bg-amber-50 border border-amber-400 p-3 rounded-xl mb-4 flex items-start gap-3 animate-pulse">
                  <i className="fa-solid fa-triangle-exclamation text-amber-500 text-xl mt-0.5"></i>
                  <div>
                    <h4 className="font-bold text-amber-800 text-sm uppercase">Lưu ý: Nhiệm vụ kép!</h4>
                    <p className="text-xs text-amber-700 mt-0.5">Hồ sơ này đang nợ Thay điện kế định kỳ. Bắt buộc phải thay công tơ mới và bấm xác nhận trước khi được phép đóng điện lại.</p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                 <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 border-b pb-1">Mảng Nghiệp Vụ Giấy Tờ / Tài Chính</h4>
                 {customerInfo?.trang_thai === 'cho_xac_minh' && (
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => openActionModal('vp_xac_minh_ok', 'Xác minh OK - Gạch nợ')} className="w-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-bold py-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all"><i className="fa-solid fa-circle-check text-lg"></i> <span className="text-[10px] uppercase">Xác Minh OK</span></button>
                      <button onClick={() => openActionModal('vp_yeu_cau_cat', 'Từ chối hoãn - Chỉ thị cắt')} className="w-full bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 font-bold py-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all"><i className="fa-solid fa-triangle-exclamation text-lg"></i> <span className="text-[10px] uppercase">Chuyển lệnh cắt</span></button>
                    </div>
                 )}
                 {customerInfo?.trang_thai === 'tro_ngai' && <button onClick={() => openActionModal('vp_kich_hoat_lai', 'Đã xử lý xong trở ngại - Khôi phục lệnh')} className="w-full bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all"><i className="fa-solid fa-rotate-right text-base"></i> Đã giải quyết trở ngại - Tiếp tục cắt</button>}
                 {customerInfo?.so_tien_no > 0 && customerInfo?.trang_thai === 'da_cat' && <button onClick={() => openActionModal('thu_tien_no', 'Xác nhận gạch xóa nợ cước')} className="w-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all"><i className="fa-solid fa-file-invoice-dollar text-base"></i> Xác nhận KH Đã Đóng Tiền Cước</button>}

                 <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 mt-4 border-b pb-1">Mảng Nghiệp Vụ Thi Công Địa Bàn</h4>
                 {customerInfo?.trang_thai === 'cho_cat' && (
                    <>
                      <button onClick={() => openActionModal('ht_da_cat', 'Xác nhận đóng khóa công tơ')} className="w-full bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all mb-1"><i className="fa-solid fa-scissors text-base"></i> Xác nhận ĐÃ NGƯNG HƠI THỰC TẾ</button>
                      <button onClick={() => openActionModal('ht_tro_ngai', 'Báo cáo vướng mắc không thi công được')} className="w-full bg-white text-purple-700 border border-purple-300 hover:bg-purple-50 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all"><i className="fa-solid fa-ban text-base"></i> Báo cáo Trở ngại (Khóa cổng...)</button>
                    </>
                 )}
                 {customerInfo?.trang_thai === 'da_cat' && (
                    <div className="space-y-2">
                      {/* Nút gọi Google Maps: Chỉ hiện ra khi hồ sơ đó đã có cắm chốt GPS */}
                      {customerInfo?.vi_do && customerInfo?.kinh_do && (
                        <a 
                          href={`https://www.google.com/maps/dir/?api=1&destination=${customerInfo.vi_do},${customerInfo.kinh_do}`} 
                          target="_blank" rel="noreferrer" 
                          className="w-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all"
                        >
                          <i className="fa-solid fa-map-location-dot text-base text-blue-500"></i> Bản đồ dẫn đường tới trụ điện
                        </a>
                      )}
                      
                      {/* LOGIC NHIỆM VỤ KÉP: Khóa nút Đóng điện nếu còn nợ tiền HOẶC nợ thay định kỳ */}
                      <button 
                        onClick={() => openActionModal(
                          'da_de_dien', 
                          customerInfo.ly_do_ngung === 'bat_thuong' ? 'Xác nhận an toàn, đóng điện lại' : 
                          customerInfo.ly_do_ngung === 'kh_yeu_cau' ? 'Đóng điện lại theo yêu cầu KH' : 
                          'Xác nhận mở niêm chì đóng điện lại'
                        )} 
                        disabled={(customerInfo.ly_do_ngung === 'no_cuoc' && customerInfo.so_tien_no > 0) || customerInfo.chua_thay_dinh_ky} 
                        className={`w-full font-bold py-3 px-2 text-sm md:text-base md:py-3.5 rounded-xl flex items-center justify-center gap-1.5 border transition-all text-center ${((customerInfo.ly_do_ngung === 'no_cuoc' && customerInfo.so_tien_no > 0) || customerInfo.chua_thay_dinh_ky) ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-green-600 text-white border-green-700 hover:bg-green-700 shadow-md'}`}
                      >
                        {customerInfo.chua_thay_dinh_ky ? (
                          <><i className="fa-solid fa-lock"></i> Phải Thay Điện Kế trước khi mở</>
                        ) : customerInfo.ly_do_ngung === 'no_cuoc' && customerInfo.so_tien_no > 0 ? (
                          <><i className="fa-solid fa-lock"></i> Chờ gạch nợ cước để mở điện</>
                        ) : customerInfo.ly_do_ngung === 'bat_thuong' ? (
                          <><i className="fa-solid fa-clipboard-check"></i> Xác nhận an toàn, để điện lại</>
                        ) : customerInfo.ly_do_ngung === 'kh_yeu_cau' ? (
                          <><i className="fa-solid fa-user-check"></i> Xác nhận để điện lại theo yêu cầu</>
                        ) : (
                          <><i className="fa-solid fa-plug-circle-bolt"></i> Xác nhận ĐÃ ĐỂ ĐIỆN LẠI</>
                        )}
                      </button>
                    </div>
                 )}
                 {customerInfo?.chua_thay_dinh_ky && <button onClick={() => openActionModal('thay_dinh_ky', 'Xác nhận hoàn tất thay công tơ mới')} className="w-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 mt-1 transition-all"><i className="fa-solid fa-screwdriver-wrench text-base"></i> Đã Thay Điện Kế Định Kỳ Xong</button>}
              </div>

              {/* TIMELINE LỊCH SỬ CÓ HIỂN THỊ ẢNH MINH CHỨNG */}
              <div className="mt-6 pt-5 border-t border-slate-200 fade-in">
                 <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><i className="fa-solid fa-clock-rotate-left"></i> Dòng thời gian xử lý</h4>
                 <div className="relative border-l border-slate-200 ml-2 space-y-4">
                   {customerLogs.length === 0 ? <p className="text-xs text-slate-400 italic pl-3">Chưa có dữ liệu ghi vết lịch sử.</p> : customerLogs.map((log) => (
                        <div key={log.id} className="relative pl-4">
                           <div className="absolute left-[-4px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-white"></div>
                           <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg">
                              <p className="text-[9px] font-bold text-slate-400 mb-0.5 flex items-center gap-1"><i className="fa-regular fa-calendar text-[8px]"></i>{new Date(log.created_at).toLocaleString('vi-VN')}</p>
                              <p className="text-xs font-black text-slate-700">{log.hanh_dong}</p>
                              <p className="text-xs text-slate-500 leading-normal mt-0.5">{log.noi_dung}</p>
                              {log.image_url && (
                                <div 
                                  onClick={() => setPreviewImage(log.image_url)}
                                  className="mt-2 rounded-lg overflow-hidden border border-slate-200 shadow-sm relative group cursor-pointer"
                                >
                                  <img src={log.image_url} alt="Minh chứng hiện trường" className="w-full h-auto max-h-48 object-cover" />
                                  <div className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                                    <i className="fa-solid fa-expand text-[10px]"></i>
                                  </div>
                                </div>
                              )}
                           </div>
                        </div>
                   ))}
                 </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* NÚT THÊM MỚI ĐƯỢC ĐƯA RA VÙNG AN TOÀN (KHÔNG BỊ GIẬT KHI CHUYỂN TAB) */}
      {viewMode === 'list' && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-md pointer-events-none z-[50]">
          <button onClick={() => { resetCustomerForm(); setViewMode('add'); }} className="absolute bottom-0 right-4 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-[0_4px_15px_rgba(37,99,235,0.4)] flex items-center justify-center active:scale-90 border-2 border-white pointer-events-auto transition-transform hover:scale-105 fade-in">
            <i className="fa-solid fa-plus text-2xl"></i>
          </button>
        </div>
      )}

      {/* CỬA SỔ XÁC NHẬN MODAL CÓ GẮN CAMERA */}
      {actionModal.isOpen && actionModal.type !== '' && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 fade-in">
          <form onSubmit={handleConfirmAction} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-blue-600 p-4 flex justify-between items-center shrink-0"><h3 className="font-bold text-white text-xs uppercase tracking-wider"><i className="fa-regular fa-clock mr-1.5"></i> Biên bản hệ thống</h3><button type="button" onClick={closeActionModal} className="text-white/80 hover:text-white"><i className="fa-solid fa-xmark text-lg"></i></button></div>
            
            <div className="p-5 space-y-4 overflow-y-auto no-scrollbar">
              <p className="text-xs font-black text-slate-700 text-center uppercase tracking-wide bg-slate-50 py-2 rounded-lg border border-slate-100">{actionModal.title}</p>
              
              {actionModal.type === 'ht_tro_ngai' && (
                <div className="fade-in mb-3">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mô tả chi tiết vướng mắc *</label>
                  <textarea value={actionNote} onChange={(e) => setActionNote(e.target.value)} required placeholder="VD: Khách khóa cổng..." rows="2" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none"></textarea>
                </div>
              )}

              {/* KHU VỰC CHỤP ẢNH MINH CHỨNG (CHỈ HIỆN KHI CẮT ĐIỆN) */}
              {actionModal.type === 'ht_da_cat' && (
                <div className="fade-in border-t border-slate-100 pt-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">📸 Minh chứng cắt điện (Tùy chọn)</label>
                  {!actionImage ? (
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 bg-slate-50/50 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6 text-slate-400">
                        <i className="fa-solid fa-camera text-2xl mb-1"></i><p className="text-[10px] font-medium uppercase tracking-wider">Bấm để chụp ảnh tại trụ</p>
                      </div>
                      {/* capture="environment" sẽ ép điện thoại tự mở luôn Camera chụp hình */}
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if(e.target.files && e.target.files[0]) setActionImage(e.target.files[0]); }} />
                    </label>
                  ) : (
                    <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-inner group">
                      <img src={URL.createObjectURL(actionImage)} alt="Preview" className="w-full h-32 object-cover" />
                      <button type="button" onClick={() => setActionImage(null)} className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center hover:bg-red-500 backdrop-blur-sm transition-colors"><i className="fa-solid fa-xmark"></i></button>
                    </div>
                  )}
                  {/* Dòng trạng thái GPS trấn an thợ */}
                  <div className="mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-100 p-2.5 rounded-lg">
                    <i className="fa-solid fa-location-crosshairs text-emerald-500 animate-pulse"></i>
                    <p className="text-[10px] text-emerald-700 font-bold leading-tight">Hệ thống sẽ tự động chốt tọa độ GPS tại điểm đứng khi bấm CẬP NHẬT.</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Thời gian ghi nhận thực tế</label>
                <input type="datetime-local" value={actionDate} onChange={(e) => setActionDate(e.target.value)} required className="w-full p-2.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-3 shrink-0">
              <button type="button" onClick={closeActionModal} className="w-1/3 py-2.5 rounded-lg font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 text-xs uppercase tracking-wider">Hủy</button>
              <button type="submit" disabled={loading} className="w-2/3 py-2.5 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md flex justify-center items-center gap-1.5 text-xs uppercase tracking-wider">{loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-cloud-arrow-up"></i>} CẬP NHẬT</button>
            </div>
          </form>
        </div>
      )}

      {/* CỬA SỔ PHÓNG TO ẢNH MINH CHỨNG */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-2 fade-in backdrop-blur-sm" 
          onClick={() => setPreviewImage(null)}
        >
          <button 
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-[70] w-10 h-10 bg-black/50 rounded-full flex items-center justify-center"
            onClick={() => setPreviewImage(null)}
          >
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
          <img 
            src={previewImage} 
            alt="Phóng to minh chứng" 
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" 
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}

        

    {/* ================= GIAO DIỆN BẢN ĐỒ TOÀN MÀN HÌNH ================= */}
      {viewMode === 'map' && (
        <div className="fixed inset-0 z-[70] bg-slate-100 flex flex-col fade-in">
          {/* Thanh công cụ Bản đồ */}
          <div className="bg-slate-800 text-white p-4 flex justify-between items-center shrink-0 shadow-lg z-10">
            <div>
              <h3 className="font-bold text-sm tracking-wide uppercase flex items-center gap-2"><i className="fa-solid fa-radar text-emerald-400 animate-spin-slow"></i> Radar Lưới Điện</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Hiển thị {filteredCustomers.filter(k => k.vi_do && k.kinh_do).length} điểm có tọa độ GPS</p>
            </div>
            <button onClick={() => setViewMode('list')} className="bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg text-xs font-bold transition-all"><i className="fa-solid fa-list mr-1"></i> Đóng Bản đồ</button>
          </div>
          
          {/* Vùng Bản Đồ */}
          <div className="flex-1 w-full relative z-0">
            <MapContainer 
              center={[10.563, 105.215]} // Trọng tâm ban đầu đặt tại khu vực Châu Phú
              zoom={13} 
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
              
              {filteredCustomers.filter(kh => kh.vi_do && kh.kinh_do).map((kh) => (
                <Marker key={kh.id} position={[parseFloat(kh.vi_do), parseFloat(kh.kinh_do)]} icon={createCustomIcon(kh.trang_thai)}>
                  <Popup className="custom-popup">
                    <div className="p-1 min-w-[160px]">
                      <span className="font-mono text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-blue-700 border border-slate-200 mb-1 inline-block">{kh.ma_pe}</span>
                      <h4 className="font-bold text-xs text-slate-800 leading-tight mb-1">{kh.ten_kh}</h4>
                      {kh.so_tien_no > 0 && <p className="text-xs text-rose-600 font-bold mb-2"><i className="fa-solid fa-sack-dollar"></i> Nợ: {kh.so_tien_no.toLocaleString('vi-VN')}đ</p>}
                      <button 
                        onClick={() => loadToProcess(kh)} 
                        className="w-full bg-blue-600 text-white py-2 rounded shadow-sm font-bold text-[10px] uppercase hover:bg-blue-700"
                      >
                        Vào Xử Lý Ca Này <i className="fa-solid fa-arrow-right ml-1"></i>
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
            
            {/* Chú giải nổi trên bản đồ */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border border-slate-200 flex gap-4 pointer-events-none z-[400]">
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-600 uppercase"><span className="w-3 h-3 rounded-full bg-red-100 border-2 border-red-500 block"></span> Chờ Cắt</div>
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-600 uppercase"><span className="w-3 h-3 rounded-full bg-green-100 border-2 border-green-500 block"></span> Đã Xong</div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}