import React, { useState, useEffect } from "react";
import { useSettings } from "../contexts/SettingsContext";
import {
  Search,
  Filter,
  FileText,
  Image as ImageIcon,
  Video,
  Headphones,
  Plus,
  MoreVertical,
  Trash2,
  Edit,
  LayoutGrid,
  List as ListIcon,
  X,
  Maximize2,
  File,
  Database,
  UploadCloud,
  ExternalLink
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { cn } from "../lib/utils";
import { uploadFile, deleteFile, getSignedUrl } from "../services/fileService";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { MathRenderer } from "../components/MathRenderer";
import { DeleteModal } from "../components/DeleteModal";

const detectType = (content: string) => {
  if (!content) return 'text';
  const lower = content.toLowerCase();
  if (lower.startsWith('data:image/') || lower.match(/<img /) || lower.match(/^!\[.*\]\(.*\)$/) || lower.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/)) return 'image';
  if (lower.startsWith('data:audio/') || lower.match(/<audio /) || lower.match(/\.(mp3|wav|ogg)(\?.*)?$/)) return 'audio';
  if (lower.startsWith('data:video/') || lower.match(/<video /) || lower.match(/\.(mp4|webm)(\?.*)?$/) || lower.includes('youtube.com') || lower.includes('vimeo.com')) return 'video';
  if (lower.startsWith('data:application/') || lower.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx)(\?.*)?$/)) return 'document';
  return 'text';
};

export const SpatialMap = () => {
  const [stimuli, setStimuli] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [itemToDelete, setItemToDelete] = useState<any | null>(null);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [previewModalAsset, setPreviewModalAsset] = useState<any | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { language } = useSettings();

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    // Có thể thay alert bằng toast notification nếu có library
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const processFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      alert("File is too large! Please select a file smaller than 5MB.");
      return;
    }

    setFileToUpload(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      const newType = file.type.startsWith('image/') ? 'image' : 
                      (file.type.startsWith('video/') ? 'video' : 
                      (file.type.startsWith('audio/') ? 'audio' : 
                      (file.type.startsWith('application/') || file.name.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i) ? 'document' : 'text')));
      setEditForm(prev => ({ 
        ...prev, 
        file_reference: reader.result as string,
        file_reference_signed: undefined,
        type: newType,
        tac_pham: prev.tac_pham || file.name
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);

  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("ngu_lieu")
        .select("*")
        .order("ma_ngu_lieu", { ascending: false });

      if (error) throw error;

      const processedData = await Promise.all((data || []).map(async (item) => {
        let signedUrl = null;
        let fileRefSigned = null;

        if (item.noi_dung && !item.noi_dung.startsWith('http') && !item.noi_dung.startsWith('data:') && !item.noi_dung.match(/^[<!]/) && item.noi_dung.includes('/spatial_map/')) {
            signedUrl = await getSignedUrl(item.noi_dung);
        }
        
        if (item.file_reference && !item.file_reference.startsWith('http') && !item.file_reference.startsWith('data:')) {
            fileRefSigned = await getSignedUrl(item.file_reference);
        }

        return { 
          ...item, 
          original_path: item.noi_dung, 
          noi_dung_signed: signedUrl,
          file_reference_signed: fileRefSigned
        };
      }));

      setStimuli(processedData);
      
      if (selectedAsset) {
        const updatedSelected = processedData.find(a => a.ma_ngu_lieu === selectedAsset.ma_ngu_lieu);
        if (updatedSelected) {
          setSelectedAsset(updatedSelected);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const processedStimuli = stimuli.map(s => ({
    ...s,
    type: detectType(s.file_reference || s.original_path || s.noi_dung)
  }));

  const filteredStimuli = processedStimuli.filter(s => {
    const matchesSearch = (s.tac_pham || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (s.ma_ngu_lieu || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (s.noi_dung || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "all" || s.type === activeTab;
    return matchesSearch && matchesTab;
  });

  const handleSave = async () => {
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      let finalNoiDung = editForm.noi_dung || null;
      let finalFileRef = editForm.file_reference || null;

      if (fileToUpload) {
        const ext = fileToUpload.name.split('.').pop();
        const uuid = crypto.randomUUID();
        const filePath = `${user.id}/spatial_map/${editForm.ma_ngu_lieu || 'new'}/${uuid}.${ext}`;
        
        await uploadFile(fileToUpload, filePath);
        finalFileRef = filePath;
      }

      const payload: any = {
        noi_dung: finalNoiDung,
        file_reference: finalFileRef,
        tac_gia: editForm.tac_gia || null,
        tac_pham: editForm.tac_pham || (finalNoiDung || finalFileRef ? "Untitled Asset" : null),
        nguoi_tao: user.id
      };

      let error;
      if (editForm.ma_ngu_lieu) {
        const res = await supabase
          .from("ngu_lieu")
          .update(payload)
          .eq("ma_ngu_lieu", editForm.ma_ngu_lieu);
        error = res.error;
      } else {
        const res = await supabase.from("ngu_lieu").insert([payload]).select().single();
        error = res.error;
      }

      if (error) throw error;
      setIsEditing(false);
      setFileToUpload(null);
      await fetchData();
    } catch (err: any) {
      console.error(err);
      alert("Error saving: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (asset: any) => {
    try {
      setSaving(true);
      const { data: qData } = await supabase.from('cau_hoi').select('ma_cau_hoi').eq('ma_ngu_lieu', asset.ma_ngu_lieu).limit(1);
      if (qData && qData.length > 0) {
        throw new Error('Cannot delete this asset because it is being used by one or more questions.');
      }
      
      if (asset.noi_dung && asset.noi_dung.includes('/spatial_map/')) {
        await deleteFile(asset.noi_dung);
      }
      if (asset.file_reference && asset.file_reference.includes('/spatial_map/')) {
        await deleteFile(asset.file_reference);
      }

      const { error } = await supabase.from("ngu_lieu").delete().eq("ma_ngu_lieu", asset.ma_ngu_lieu);
      if (error) throw error;
      if (selectedAsset?.ma_ngu_lieu === asset.ma_ngu_lieu) setSelectedAsset(null);
      setSelectedItems(prev => prev.filter(id => id !== asset.ma_ngu_lieu));
      setItemToDelete(null);
      await fetchData();
    } catch (err: any) {
      console.error(err);
      alert("Error deleting: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    try {
      setSaving(true);
      
      const { data: qData } = await supabase.from('cau_hoi').select('ma_cau_hoi').in('ma_ngu_lieu', selectedItems).limit(1);
      if (qData && qData.length > 0) {
        throw new Error(language === 'vi' ? 'Không thể xóa vì một hoặc nhiều tài nguyên đang được sử dụng.' : 'Cannot delete because one or more selected assets are being used by questions.');
      }
      
      const assetsToDelete = stimuli.filter(a => selectedItems.includes(a.ma_ngu_lieu));
      const storagePaths = assetsToDelete
        .flatMap(a => {
          const paths = [];
          if (a.noi_dung && a.noi_dung.includes('/spatial_map/')) paths.push(a.noi_dung);
          if (a.file_reference && a.file_reference.includes('/spatial_map/')) paths.push(a.file_reference);
          return paths;
        });
        
      if (storagePaths.length > 0) {
        for (const p of storagePaths) {
           await deleteFile(p);
        }
      }
      
      const { error } = await supabase.from("ngu_lieu").delete().in("ma_ngu_lieu", selectedItems);
      if (error) throw error;
      
      if (selectedAsset && selectedItems.includes(selectedAsset.ma_ngu_lieu)) {
        setSelectedAsset(null);
      }
      
      setSelectedItems([]);
      setBulkDeleteConfirm(false);
      await fetchData();
    } catch (err: any) {
      console.error(err);
      alert("Error bulk deleting: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleSelection = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredStimuli.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredStimuli.map(a => a.ma_ngu_lieu));
    }
  };

  const TypeIcon = ({ type, className }: { type: string, className?: string }) => {
    switch (type) {
      case 'image': return <ImageIcon className={className} />;
      case 'video': return <Video className={className} />;
      case 'audio': return <Headphones className={className} />;
      default: return <FileText className={className} />;
    }
  };

  const TypeColor = (type: string) => {
    switch (type) {
      case 'image': return "text-blue-500 bg-blue-500/10 border-blue-500/20";
      case 'video': return "text-purple-500 bg-purple-500/10 border-purple-500/20";
      case 'audio': return "text-green-500 bg-green-500/10 border-green-500/20";
      default: return "text-orange-500 bg-orange-500/10 border-orange-500/20";
    }
  };

  const renderPreview = (asset: any, isDetail = false) => {
    const noiDung = asset.file_reference_signed || asset.file_reference || asset.noi_dung_signed || asset.noi_dung || '';
    if (asset.type === 'image') {
      const url = noiDung.startsWith('data:') ? noiDung : (noiDung.match(/!\[.*\]\((.*)\)/)?.[1] || noiDung.match(/src="([^"]*)"/)?.[1] || noiDung);
      return <div className="w-full h-full bg-surface-dim flex items-center justify-center overflow-hidden">
        {url.startsWith('http') || url.startsWith('data:') ? <img src={url} alt="preview" className="object-cover w-full h-full" /> : <ImageIcon className="w-12 h-12 text-outline-variant" />}
      </div>;
    }
    if (asset.type === 'video') {
      const url = noiDung.startsWith('data:') ? noiDung : (noiDung.match(/src="([^"]*)"/)?.[1] || noiDung);
      if (isDetail && (url.startsWith('http') || url.startsWith('data:'))) {
        return <video src={url} controls className="w-full h-full bg-black object-contain" />;
      }
      return <div className="w-full h-full bg-surface-dim flex items-center justify-center">
        <Video className="w-12 h-12 text-outline-variant" />
      </div>;
    }
    if (asset.type === 'audio') {
      const url = noiDung.startsWith('data:') ? noiDung : (noiDung.match(/src="([^"]*)"/)?.[1] || noiDung);
      if (isDetail && (url.startsWith('http') || url.startsWith('data:'))) {
        return <div className="w-full h-full flex flex-col items-center justify-center bg-surface-dim p-4">
          <Headphones className="w-12 h-12 text-outline-variant mb-4" />
          <audio src={url} controls className="w-full" />
        </div>;
      }
      return <div className="w-full h-full bg-surface-dim flex items-center justify-center">
        <Headphones className="w-12 h-12 text-outline-variant" />
      </div>;
    }
    if (asset.type === 'document') {
      const url = noiDung.startsWith('data:') ? noiDung : (noiDung.match(/src="([^"]*)"/)?.[1] || noiDung);
      if (isDetail && (url.startsWith('http') || url.startsWith('data:'))) {
         const isPdf = url.includes('application/pdf') || url.toLowerCase().includes('.pdf');
         const isOffice = url.toLowerCase().match(/\.(doc|docx|xls|xlsx|ppt|pptx)(\?.*)?$/) !== null;
         
         if (isPdf) {
            return (
              <div className="w-full h-full flex flex-col relative bg-surface rounded-lg overflow-hidden">
                 <iframe src={url} className="w-full h-full flex-1 border-0" title="Document Preview" />
                 <a href={url} target="_blank" rel="noopener noreferrer" className="absolute top-4 right-4 px-4 py-2 bg-surface text-on-surface shadow-md border border-outline-variant rounded-lg text-sm flex items-center gap-2 hover:bg-surface-bright transition-colors z-10">
                   <ExternalLink className="w-4 h-4" />
                   Mở tab mới
                 </a>
              </div>
            );
         }
         
         if (isOffice && url.startsWith('http')) {
            const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
            return (
              <div className="w-full h-full flex flex-col relative bg-surface rounded-lg overflow-hidden">
                 <iframe src={viewerUrl} className="w-full h-full flex-1 border-0" title="Office Document Preview" />
                 <a href={url} target="_blank" rel="noopener noreferrer" className="absolute top-4 right-4 px-4 py-2 bg-surface text-on-surface shadow-md border border-outline-variant rounded-lg text-sm flex items-center gap-2 hover:bg-surface-bright transition-colors z-10">
                   <ExternalLink className="w-4 h-4" />
                   Tải xuống
                 </a>
              </div>
            );
         }

         return <div className="w-full h-full flex flex-col items-center justify-center bg-surface-dim p-4">
           <FileText className="w-12 h-12 text-outline-variant mb-4" />
           <a href={url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm">
             Tải xuống / Xem tài liệu
           </a>
         </div>;
      }
      return <div className="w-full h-full bg-surface-dim flex items-center justify-center">
        <FileText className="w-12 h-12 text-outline-variant" />
      </div>;
    }
    return <div className="w-full h-full bg-surface-dim p-4 overflow-hidden text-xs text-on-surface-variant font-mono">
      <MathRenderer content={noiDung.substring(0, 200) + (noiDung.length > 200 ? '...' : '')} />
    </div>;
  };

  const tabs = [
    { id: "all", label: language === "vi" ? "Tất cả" : "All Assets", icon: LayoutGrid },
    { id: "image", label: language === "vi" ? "Hình ảnh" : "Images", icon: ImageIcon },
    { id: "video", label: language === "vi" ? "Video" : "Videos", icon: Video },
    { id: "audio", label: language === "vi" ? "Âm thanh" : "Audio", icon: Headphones },
    { id: "document", label: language === "vi" ? "Tài liệu" : "Files", icon: FileText },
    { id: "text", label: language === "vi" ? "Văn bản" : "Texts", icon: FileText },
  ];

  return (
    <div className="flex h-full flex-col -m-8 bg-background font-sans">
      <LoadingOverlay isLoading={loading} message={language === "vi" ? "Đang tải dữ liệu..." : "Loading Assets..."} />

      {/* Header */}
      <div className="px-8 py-6 border-b border-outline-variant bg-surface shrink-0 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-display font-bold text-on-surface mb-1 flex items-center">
            <Database className="w-6 h-6 mr-3 text-primary" />
            {language === "vi" ? "Kho Ngữ Liệu" : "Asset Repository"}
          </h1>
          <p className="text-sm text-on-surface-variant">
            {language === "vi" ? "Quản lý tập trung hình ảnh, video, âm thanh và văn bản cho các câu hỏi." : "Centralized management for images, videos, audio, and text passages."}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {selectedItems.length > 0 && (
            <button 
              onClick={() => setBulkDeleteConfirm(true)}
              className="px-4 py-2 bg-error hover:bg-error/90 text-on-primary font-medium rounded-lg text-sm transition-colors flex items-center"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {language === "vi" ? `Xóa (${selectedItems.length})` : `Delete (${selectedItems.length})`}
            </button>
          )}
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              type="text"
              placeholder={language === "vi" ? "Tìm kiếm tài nguyên..." : "Search assets..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-outline-variant rounded-lg text-sm focus:border-primary outline-none transition-colors"
            />
          </div>
          <button 
            onClick={() => { setEditForm({}); setIsEditing(true); }}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-on-primary font-medium rounded-lg text-sm transition-colors flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            {language === "vi" ? "Tải lên / Thêm mới" : "Upload / Add New"}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-8 py-4 border-b border-outline-variant bg-background shrink-0 flex justify-between items-center">
        <div className="flex space-x-1 bg-surface border border-outline-variant rounded-lg p-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                  activeTab === tab.id 
                    ? "bg-background text-primary shadow-sm" 
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-bright"
                )}
              >
                <Icon className="w-4 h-4 mr-2" />
                {tab.label}
                <span className="ml-2 text-[10px] bg-outline-variant/30 px-1.5 py-0.5 rounded-full">
                  {tab.id === 'all' ? processedStimuli.length : processedStimuli.filter(s => s.type === tab.id).length}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center text-sm text-on-surface cursor-pointer select-none">
            <input 
              type="checkbox" 
              className="mr-2 w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
              checked={selectedItems.length === filteredStimuli.length && filteredStimuli.length > 0}
              onChange={toggleSelectAll}
            />
            {language === "vi" ? "Chọn tất cả" : "Select All"}
          </label>
          <div className="flex items-center bg-surface border border-outline-variant rounded-lg p-1">
          <button 
            onClick={() => setViewMode("grid")}
            className={cn("p-1.5 rounded-md transition-colors", viewMode === "grid" ? "bg-background text-primary shadow-sm" : "text-outline hover:text-on-surface")}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setViewMode("list")}
            className={cn("p-1.5 rounded-md transition-colors", viewMode === "list" ? "bg-background text-primary shadow-sm" : "text-outline hover:text-on-surface")}
          >
            <ListIcon className="w-4 h-4" />
          </button>
        </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex relative">
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {filteredStimuli.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-outline">
              <Database className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium text-on-surface-variant">{language === "vi" ? "Không tìm thấy tài nguyên nào" : "No assets found"}</p>
              <p className="text-sm mt-1">{language === "vi" ? "Hãy thử thay đổi bộ lọc hoặc thêm tài nguyên mới." : "Try changing filters or add a new asset."}</p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {filteredStimuli.map(asset => (
                <div 
                  key={asset.ma_ngu_lieu}
                  onClick={() => setSelectedAsset(asset)}
                  className={cn(
                    "group glass-panel rounded-xl overflow-hidden cursor-pointer transition-all hover:-translate-y-1 relative shadow-sm hover:shadow-xl",
                    selectedAsset?.ma_ngu_lieu === asset.ma_ngu_lieu ? "border-primary ring-1 ring-primary shadow-primary/20" : "border-outline-variant hover:border-primary/50",
                    selectedItems.includes(asset.ma_ngu_lieu) && "ring-2 ring-primary/50"
                  )}
                >
                  <div className="absolute top-2 left-2 z-10">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer bg-white"
                      checked={selectedItems.includes(asset.ma_ngu_lieu)}
                      onChange={(e) => toggleSelection(asset.ma_ngu_lieu, e as unknown as React.MouseEvent)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="aspect-[4/3] relative border-b border-outline-variant bg-surface-dim overflow-hidden">
                    {renderPreview(asset)}
                    <div className={cn(
                      "absolute top-2 right-2 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border backdrop-blur-md shadow-sm",
                      TypeColor(asset.type)
                    )}>
                      {asset.type}
                    </div>
                  </div>
                  <div className="p-4 bg-surface/50 backdrop-blur-sm">
                    <h3 className="font-medium text-on-surface text-sm truncate" title={asset.tac_pham || asset.ma_ngu_lieu}>
                      {asset.tac_pham || asset.ma_ngu_lieu}
                    </h3>
                    <div className="flex items-center justify-between mt-3">
                      <button 
                        onClick={(e) => handleCopyId(e, asset.ma_ngu_lieu)}
                        className="text-[10px] text-outline font-mono bg-surface-bright/50 px-2 py-1 rounded border border-outline-variant hover:border-primary hover:text-primary transition-colors flex items-center gap-1"
                        title={language === 'vi' ? 'Sao chép ID' : 'Copy ID'}
                      >
                        {asset.ma_ngu_lieu.substring(0, 8)}...
                      </button>
                      <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setEditForm(asset); setIsEditing(true); }}
                          className="p-1.5 text-outline hover:text-primary hover:bg-primary/10 transition-colors bg-surface-bright rounded border border-outline-variant hover:border-primary/30"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setItemToDelete(asset); }}
                          className="p-1.5 text-outline hover:text-error hover:bg-error/10 transition-colors bg-surface-bright rounded border border-outline-variant hover:border-error/30"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-dim border-b border-outline-variant text-outline font-medium">
                  <tr>
                    <th className="px-6 py-4 w-12">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
                        checked={selectedItems.length === filteredStimuli.length && filteredStimuli.length > 0}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-6 py-4 w-12">Loại</th>
                    <th className="px-6 py-4">Tên / Nội dung</th>
                    <th className="px-6 py-4">Mã</th>
                    <th className="px-6 py-4">Người tạo</th>
                    <th className="px-6 py-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {filteredStimuli.map(asset => (
                    <tr 
                      key={asset.ma_ngu_lieu}
                      onClick={() => setSelectedAsset(asset)}
                      className={cn(
                        "hover:bg-surface-bright cursor-pointer transition-colors group",
                        selectedAsset?.ma_ngu_lieu === asset.ma_ngu_lieu && "bg-primary/5",
                        selectedItems.includes(asset.ma_ngu_lieu) && "bg-primary/5"
                      )}
                    >
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer"
                          checked={selectedItems.includes(asset.ma_ngu_lieu)}
                          onChange={(e) => toggleSelection(asset.ma_ngu_lieu, e as unknown as React.MouseEvent)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border", TypeColor(asset.type))}>
                          <TypeIcon type={asset.type} className="w-4 h-4" />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-on-surface">{asset.tac_pham || "Untitled"}</div>
                        <div className="text-xs text-on-surface-variant truncate max-w-md mt-1">{asset.noi_dung}</div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-outline">{asset.ma_ngu_lieu}</td>
                      <td className="px-6 py-4 text-outline-variant">{asset.nguoi_tao || '--'}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setEditForm(asset); setIsEditing(true); }}
                            className="p-1.5 text-outline hover:text-primary transition-colors bg-background rounded border border-outline-variant hover:border-primary"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setItemToDelete(asset); }}
                            className="p-1.5 text-outline hover:text-error transition-colors bg-background rounded border border-outline-variant hover:border-error"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Side Panel for Asset Details */}
        {selectedAsset && (
          <div className="w-96 border-l border-outline-variant bg-surface flex flex-col shrink-0 animate-in slide-in-from-right">
            <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-dim">
              <h3 className="font-bold text-on-surface">{language === "vi" ? "Chi tiết Ngữ liệu" : "Asset Details"}</h3>
              <button 
                onClick={() => setSelectedAsset(null)}
                className="p-1.5 text-outline hover:text-on-surface bg-background border border-outline-variant rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
              <div className="aspect-video bg-background border border-outline-variant rounded-lg overflow-hidden flex items-center justify-center relative group">
                {renderPreview(selectedAsset, true)}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button onClick={() => setPreviewModalAsset(selectedAsset)} className="p-2 bg-surface rounded-full text-on-surface hover:text-primary hover:scale-110 transition-all">
                    <Maximize2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border", TypeColor(selectedAsset.type))}>
                    {selectedAsset.type}
                  </div>
                  <span className="text-xs text-outline font-mono">{selectedAsset.ma_ngu_lieu}</span>
                </div>
                <h2 className="text- font-display font-bold text-on-surface mt-2">{selectedAsset.tac_pham || "Untitled Asset"}</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-outline tracking-widest uppercase mb-1 block">
                    {language === "vi" ? "Nội dung gốc" : "Raw Content"}
                  </label>
                  <div className="bg-background border border-outline-variant rounded-lg p-3 text-xs font-mono text-on-surface-variant max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap break-words">
                    {selectedAsset.noi_dung || "No content"}
                  </div>
                </div>
                
                {selectedAsset.tac_gia && (
                  <div>
                    <label className="text-[10px] font-bold text-outline tracking-widest uppercase mb-1 block">
                      {language === "vi" ? "Tác giả" : "Author"}
                    </label>
                    <div className="text-sm text-on-surface">{selectedAsset.tac_gia}</div>
                  </div>
                )}
                
                <div>
                  <label className="text-[10px] font-bold text-outline tracking-widest uppercase mb-1 block">
                    {language === "vi" ? "Ngày tạo" : "Created At"}
                  </label>
                  <div className="text-sm text-on-surface">
                    {selectedAsset.ma_ngu_lieu ? `Asset ID: ${selectedAsset.ma_ngu_lieu}` : '--'}
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-outline-variant flex gap-3">
                <button 
                  onClick={() => { setEditForm(selectedAsset); setIsEditing(true); }}
                  className="flex-1 py-2 bg-surface-bright border border-outline-variant hover:border-primary text-on-surface font-medium rounded-lg text-sm transition-colors"
                >
                  {language === "vi" ? "Chỉnh sửa" : "Edit"}
                </button>
                <button 
                  onClick={() => setItemToDelete(selectedAsset)}
                  className="flex-1 py-2 bg-error/10 border border-error/20 hover:bg-error/20 text-error font-medium rounded-lg text-sm transition-colors"
                >
                  {language === "vi" ? "Xóa" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit/Add Modal */}
      {isEditing && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div 
            className={cn(
              "glass-panel border-outline-variant p-6 rounded-xl w-full max-w-2xl shadow-2xl transition-all",
              isDragging ? "ring-2 ring-primary bg-primary/5 scale-[1.02]" : ""
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-display font-bold text-on-surface flex items-center">
                {editForm.ma_ngu_lieu ? (
                  <><Edit className="w-5 h-5 mr-2 text-primary" /> {language === "vi" ? "Chỉnh sửa Tài nguyên" : "Edit Asset"}</>
                ) : (
                  <><Plus className="w-5 h-5 mr-2 text-primary" /> {language === "vi" ? "Thêm Tài nguyên mới" : "New Asset"}</>
                )}
              </h2>
              <button onClick={() => { setIsEditing(false); setFileToUpload(null); setIsDragging(false); }} className="p-1.5 text-outline hover:text-error bg-surface-bright rounded transition-colors border border-outline-variant">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-outline uppercase tracking-widest mb-1.5">
                  {language === "vi" ? "Tên tài nguyên / Tác phẩm" : "Asset Name / Title"}
                </label>
                <input
                  type="text"
                  placeholder={language === "vi" ? "VD: Hình ảnh cấu trúc DNA" : "e.g., DNA Structure Diagram"}
                  value={editForm.tac_pham || ""}
                  onChange={(e) => setEditForm({ ...editForm, tac_pham: e.target.value })}
                  className="w-full bg-surface-bright/50 border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-outline uppercase tracking-widest mb-1.5">
                  {language === "vi" ? "Tác giả / Nguồn (Tùy chọn)" : "Author / Source (Optional)"}
                </label>
                <input
                  type="text"
                  value={editForm.tac_gia || ""}
                  onChange={(e) => setEditForm({ ...editForm, tac_gia: e.target.value })}
                  className="w-full bg-surface-bright/50 border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                />
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-outline uppercase tracking-widest">
                    {language === "vi" ? "Nội dung / URL" : "Content / URL"}
                  </label>
                  <div className="flex items-center space-x-3">
                    <span className="text-[10px] text-primary font-mono bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                      {isDragging ? (language === "vi" ? "Thả file vào đây..." : "Drop file here...") : (language === "vi" ? "Kéo thả file vào khung dưới" : "Drag & drop files below")}
                    </span>
                    <label className="cursor-pointer bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-3 py-1 rounded text-xs font-bold flex items-center transition-all">
                      <UploadCloud className="w-4 h-4 mr-1.5" />
                      {language === "vi" ? "Tải File" : "Upload File"}
                      <input type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={handleFileUpload} />
                    </label>
                  </div>
                </div>
                <div className="relative">
                  <textarea
                    placeholder={language === "vi" ? "Nhập văn bản, mã LaTeX, hoặc dán URL hình ảnh/video/audio vào đây..." : "Enter text, LaTeX, or paste an image/video/audio URL here..."}
                    value={editForm.noi_dung || ""}
                    onChange={(e) => setEditForm({ ...editForm, noi_dung: e.target.value })}
                    className={cn(
                      "w-full bg-surface-bright/30 border border-outline-variant rounded-lg px-4 py-3 text-sm focus:border-primary outline-none min-h-[200px] font-mono leading-relaxed resize-y custom-scrollbar transition-all",
                      isDragging ? "bg-primary/5 border-primary border-dashed" : ""
                    )}
                  />
                  {isDragging && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg border-2 border-primary border-dashed pointer-events-none">
                      <div className="flex flex-col items-center text-primary">
                        <UploadCloud className="w-12 h-12 mb-2 animate-bounce" />
                        <span className="font-bold">{language === "vi" ? "Thả file vào đây để tải lên" : "Drop file to upload"}</span>
                      </div>
                    </div>
                  )}
                </div>
                {editForm.file_reference && (
                  <div className="mt-3 p-3 bg-primary/5 border border-primary/30 rounded-lg flex items-center gap-3 text-sm text-primary shadow-sm">
                    <File className="w-5 h-5" />
                    <span className="truncate font-medium flex-1">
                      {editForm.file_reference.startsWith('data:') 
                        ? (language === 'vi' ? 'Đã đính kèm file mới (Chờ lưu)' : 'New file attached (Pending save)') 
                        : (editForm.file_reference.split('/').pop() || editForm.file_reference)}
                    </span>
                    <button 
                      onClick={() => { setEditForm({ ...editForm, file_reference: null }); setFileToUpload(null); }}
                      className="p-1.5 hover:bg-error/10 hover:text-error rounded-md transition-colors"
                      title={language === 'vi' ? 'Xóa file đính kèm' : 'Remove attached file'}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-8 flex justify-end gap-3 pt-5 border-t border-outline-variant">
              <button
                onClick={() => { setIsEditing(false); setFileToUpload(null); setIsDragging(false); }}
                className="px-5 py-2.5 bg-surface-bright hover:bg-surface-dim border border-outline-variant hover:border-outline text-on-surface font-medium rounded-lg text-sm transition-colors"
                disabled={saving}
              >
                {language === "vi" ? "Hủy" : "Cancel"}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-on-primary font-bold rounded-lg text-sm transition-colors shadow-sm"
              >
                {saving ? (language === "vi" ? "Đang lưu..." : "Saving...") : (language === "vi" ? "Lưu Tài Nguyên" : "Save Asset")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {itemToDelete && (
        <DeleteModal
          isOpen={true}
          onClose={() => setItemToDelete(null)}
          onConfirm={() => {
            handleDelete(itemToDelete);
            setItemToDelete(null);
          }}
          title={
            <span>
              {language === 'vi' ? 'Xóa Tài Nguyên ' : 'Delete Asset '}
              <span className="text-error">{itemToDelete.ma_ngu_lieu}</span>
            </span>
          }
          description={
            language === 'vi' 
              ? `Hành động này sẽ xóa vĩnh viễn "${itemToDelete.tac_pham || 'tài nguyên này'}" khỏi kho. Không thể hoàn tác.`
              : `This will permanently remove "${itemToDelete.tac_pham || 'this asset'}" from the repository. This action cannot be undone.`
          }
        />
      )}

      {/* Bulk Delete Modal */}
      {bulkDeleteConfirm && (
        <DeleteModal
          isOpen={true}
          onClose={() => setBulkDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
          title={language === 'vi' ? 'Xóa Nhiều Tài Nguyên' : 'Bulk Delete Assets'}
          description={
            language === 'vi' 
              ? `Bạn có chắc chắn muốn xóa vĩnh viễn ${selectedItems.length} tài nguyên đã chọn khỏi kho không? Không thể hoàn tác.`
              : `Are you sure you want to permanently delete ${selectedItems.length} selected assets? This action cannot be undone.`
          }
        />
      )}

      {/* Preview Modal */}
      {previewModalAsset && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex flex-col animate-fade-in">
          <div className="flex items-center justify-between p-4 bg-black/50 border-b border-white/10 backdrop-blur-lg absolute top-0 w-full z-10 transition-transform">
             <div className="flex items-center gap-3">
               <div className={cn("px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider border shadow-sm", TypeColor(previewModalAsset.type))}>
                 {previewModalAsset.type}
               </div>
               <h3 className="font-display font-bold text-lg text-white drop-shadow-md">
                 {previewModalAsset.tac_pham || previewModalAsset.ma_ngu_lieu}
               </h3>
             </div>
             <div className="flex items-center gap-2">
               <button 
                 onClick={(e) => handleCopyId(e, previewModalAsset.ma_ngu_lieu)}
                 className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white border border-white/20 transition-colors text-sm font-medium flex items-center gap-2"
               >
                 <File className="w-4 h-4" /> Copy ID
               </button>
               <button onClick={() => setPreviewModalAsset(null)} className="p-2 bg-white/10 hover:bg-error/80 rounded-full text-white border border-white/20 transition-colors shadow-lg">
                 <X className="w-5 h-5" />
               </button>
             </div>
          </div>
          <div className="flex-1 overflow-hidden p-12 flex items-center justify-center relative mt-16 animate-slide-up">
             {renderPreview(previewModalAsset, true)}
          </div>
        </div>
      )}
    </div>
  );
};

