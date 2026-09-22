import React, { useState, useRef } from 'react';
import { KnowledgeItem, CompanyProfile } from '../types';
import { 
    Plus, FileText, Link as LinkIcon, Trash2, Upload, Building2, Save, 
    File, Image as ImageIcon, Loader2, Sparkles, Check
} from 'lucide-react';

interface KnowledgeBaseProps {
  companyProfile: CompanyProfile;
  onUpdateProfile: (profile: CompanyProfile) => void;
  items: KnowledgeItem[];
  onAddItem: (item: KnowledgeItem) => void;
  onRemoveItem: (id: string) => void;
}

const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({ 
  companyProfile, 
  onUpdateProfile, 
  items, 
  onAddItem, 
  onRemoveItem 
}) => {
  const [activeTab, setActiveTab] = useState<'resources' | 'profile'>('resources');
  
  // Resource Form State
  const [newType, setNewType] = useState<'text' | 'link' | 'pdf' | 'image' | 'doc'>('text');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractedInfoMsg, setExtractedInfoMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile Form State
  const [profileForm, setProfileForm] = useState<CompanyProfile>(companyProfile);
  const [isSaved, setIsSaved] = useState(false);

  // Helper to convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setNewTitle(file.name.split('.')[0]); 
    
    if (file.type.includes('pdf')) setNewType('pdf');
    else if (file.type.includes('image')) setNewType('image');
    else setNewType('doc');

    setIsAnalyzing(true);
    setExtractedInfoMsg(null);
    setNewContent('Initializing AI analysis...');
    
    try {
        const base64Data = await fileToBase64(file);
        const response = await fetch('/api/knowledge/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mimeType: file.type || 'application/octet-stream', data: base64Data }),
        });
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || 'Could not extract file content.');

                if (data.knowledge_content) {
                        setNewContent(data.knowledge_content);

                        const generatedId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
                            ? crypto.randomUUID()
                            : Math.random().toString(36).slice(2);

                        const autoItem: KnowledgeItem = {
                            id: generatedId,
                            type: newType,
                            title: newTitle || file.name.split('.')[0] || 'Uploaded Resource',
                            content: data.knowledge_content,
                            dateAdded: new Date(),
                            fileName: file.name,
                        };

                        onAddItem(autoItem);
                        setExtractedInfoMsg(`Added "${autoItem.title}" to Knowledge Base from upload.`);
                }

        // Auto-update profile if it's currently the default one or if explicitly found
        if (data.company_profile) {
            const { name, industry, description, address, contactPhone, contactEmail } = data.company_profile;
            
            // Check if we found meaningful data to update
            if (name && name !== "null") {
                const updatedProfile = {
                    name: name || profileForm.name,
                    industry: industry || profileForm.industry,
                    description: description || profileForm.description,
                    address: address || profileForm.address,
                    contactPhone: contactPhone || profileForm.contactPhone,
                    contactEmail: contactEmail || profileForm.contactEmail
                };

                // Update local form state
                setProfileForm(updatedProfile);
                
                // If the current global profile is generic/default, auto-save to App state
                if (companyProfile.name === 'Your Business Name') {
                    onUpdateProfile(updatedProfile);
                    setExtractedInfoMsg(`Extracted business details for "${name}" and updated Company Profile.`);
                } else {
                    setExtractedInfoMsg(`Detected business details for "${name}". Check the Company Profile tab to review and save.`);
                }
            }
        }

    } catch (error: unknown) {
        console.error("AI Analysis failed:", error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        setNewContent(`Error analyzing document: ${message}. Please paste content manually.`);
    } finally {
        setIsAnalyzing(false);
    }
  };

    const triggerFileDialog = () => {
        if (isAnalyzing) return;
        fileInputRef.current?.click();
    };

  const handleAddResource = () => {
    if (!newTitle || !newContent) return;
    
        const newItem: KnowledgeItem = {
            id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : Math.random().toString(36).substring(7),
      type: newType,
      title: newTitle,
      content: newContent,
      dateAdded: new Date(),
      fileName: fileName || undefined
    };
    onAddItem(newItem);
    
    setNewTitle('');
    setNewContent('');
    setFileName(null);
    setNewType('text');
    setExtractedInfoMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveProfile = () => {
    onUpdateProfile(profileForm);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const getIcon = (type: string) => {
    switch (type) {
        case 'link': return <LinkIcon className="w-5 h-5" />;
        case 'image': return <ImageIcon className="w-5 h-5" />;
        case 'pdf': 
        case 'doc': return <File className="w-5 h-5" />;
        default: return <FileText className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Knowledge Base</h2>
          <p className="text-slate-500 mt-1">Manage business intelligence for your AI receptionist.</p>
        </div>
        
        <div className="flex bg-slate-100/80 p-1.5 rounded-xl">
            <button 
                onClick={() => setActiveTab('resources')}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm ${
                    activeTab === 'resources' 
                    ? 'bg-white text-slate-900 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 shadow-none'
                }`}
            >
                Documents & Resources
            </button>
            <button 
                onClick={() => setActiveTab('profile')}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm ${
                    activeTab === 'profile' 
                    ? 'bg-white text-slate-900 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 shadow-none'
                }`}
            >
                Company Profile
            </button>
        </div>
      </div>

      {activeTab === 'profile' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-8">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                        <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Business Identity</h3>
                        <p className="text-slate-500 text-sm">This information defines how Maya represents your company.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="col-span-full">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Company Name</label>
                        <input 
                            type="text" 
                            value={profileForm.name}
                            onChange={(e) => setProfileForm({...profileForm, name: e.target.value})}
                            className="w-full rounded-lg border-slate-200 bg-slate-50 p-3 text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                            placeholder="e.g. Malabar Cafe"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Industry</label>
                        <input 
                            type="text" 
                            value={profileForm.industry}
                            onChange={(e) => setProfileForm({...profileForm, industry: e.target.value})}
                            className="w-full rounded-lg border-slate-200 bg-slate-50 p-3 text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                            placeholder="e.g. Restaurant"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Location</label>
                        <input 
                            type="text" 
                            value={profileForm.address}
                            onChange={(e) => setProfileForm({...profileForm, address: e.target.value})}
                            className="w-full rounded-lg border-slate-200 bg-slate-50 p-3 text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                            placeholder="e.g. MG Road, Kochi"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Contact Email</label>
                        <input 
                            type="email" 
                            value={profileForm.contactEmail}
                            onChange={(e) => setProfileForm({...profileForm, contactEmail: e.target.value})}
                            className="w-full rounded-lg border-slate-200 bg-slate-50 p-3 text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Contact Phone</label>
                        <input 
                            type="tel" 
                            value={profileForm.contactPhone}
                            onChange={(e) => setProfileForm({...profileForm, contactPhone: e.target.value})}
                            className="w-full rounded-lg border-slate-200 bg-slate-50 p-3 text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                        />
                    </div>

                    <div className="col-span-full">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">About & Core Values</label>
                        <textarea 
                            rows={4}
                            value={profileForm.description}
                            onChange={(e) => setProfileForm({...profileForm, description: e.target.value})}
                            className="w-full rounded-lg border-slate-200 bg-slate-50 p-3 text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all resize-none"
                            placeholder="Describe your business, what makes it special, and how you want Maya to represent you."
                        />
                    </div>
                </div>
            </div>
            
            <div className="bg-slate-50 px-8 py-4 border-t border-slate-200 flex justify-end">
                <button 
                    onClick={handleSaveProfile}
                    className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all transform active:scale-95 ${
                        isSaved 
                        ? 'bg-green-600 text-white' 
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200'
                    }`}
                >
                    {isSaved ? (
                        <><Check className="w-5 h-5" /> Saved Successfully</>
                    ) : (
                        <><Save className="w-5 h-5" /> Save Changes</>
                    )}
                </button>
            </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Upload Form */}
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <Plus className="w-5 h-5 text-emerald-600" /> 
                        Add Resource
                    </h3>
                    
                    {/* File Upload Zone */}
                    <div className="group relative border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-emerald-400 hover:bg-emerald-50/30 transition-all cursor-pointer mb-6">
                        <input 
                            type="file" 
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            accept=".pdf,.doc,.docx,.txt,image/*"
                            disabled={isAnalyzing}
                        />
                        <div className="flex flex-col items-center gap-3 pointer-events-none">
                            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                {isAnalyzing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
                            </div>
                            <div>
                                <span className="block text-slate-900 font-semibold">
                                    {isAnalyzing ? 'Analyzing...' : 'Upload File'}
                                </span>
                                <span className="block text-slate-500 text-xs mt-1">PDF, Images, Docs</span>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={triggerFileDialog}
                        disabled={isAnalyzing}
                        className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                    >
                        <Upload className="w-4 h-4" /> Upload PDF / Doc / Image
                    </button>
                    <p className="text-xs text-slate-500 -mt-3 mb-4 text-center">Supports PDF, DOC/DOCX, TXT, JPG/PNG. AI will auto-summarize and add it.</p>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Title</label>
                            <input 
                                type="text" 
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="e.g., Dinner Menu"
                                className="w-full rounded-lg border-slate-200 bg-slate-50 p-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                            />
                        </div>
                        
                        <div>
                             <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Type</label>
                                      <select 
                                          value={newType} 
                                          onChange={(e) => setNewType(e.target.value as KnowledgeItem['type'])}
                                className="w-full rounded-lg border-slate-200 bg-slate-50 p-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                            >
                                <option value="text">Text / Note</option>
                                <option value="link">Website Link</option>
                                <option value="pdf">PDF Document</option>
                                <option value="image">Image</option>
                                <option value="doc">Word Doc</option>
                            </select>
                        </div>
                        
                        <div>
                            <div className="flex justify-between items-center mb-1.5">
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Content</label>
                                {isAnalyzing && (
                                    <span className="text-xs text-emerald-600 flex items-center gap-1 animate-pulse">
                                        <Sparkles className="w-3 h-3" /> AI extracting info...
                                    </span>
                                )}
                            </div>
                            <textarea 
                                value={newContent}
                                onChange={(e) => setNewContent(e.target.value)}
                                rows={6}
                                placeholder="Enter text or extracted content will appear here..."
                                className="w-full rounded-lg border-slate-200 bg-slate-50 p-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none resize-none"
                            />
                        </div>

                        {extractedInfoMsg && (
                            <div className="bg-emerald-50 text-emerald-800 text-xs p-3 rounded-lg border border-emerald-100 flex gap-2">
                                <Check className="w-4 h-4 shrink-0" />
                                {extractedInfoMsg}
                            </div>
                        )}

                        <button 
                            onClick={handleAddResource}
                            disabled={!newTitle || !newContent || isAnalyzing}
                            className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold transition-all shadow-md"
                        >
                            Add to Knowledge Base
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Column: List of Items */}
            <div className="lg:col-span-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {items.map((item) => (
                        <div key={item.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group relative hover:-translate-y-1">
                            <button 
                                onClick={() => onRemoveItem(item.id)}
                                className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                            
                            <div className="flex items-start gap-4 mb-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                    item.type === 'link' ? 'bg-blue-50 text-blue-600' : 
                                    item.type === 'image' ? 'bg-purple-50 text-purple-600' :
                                    item.type === 'pdf' ? 'bg-red-50 text-red-600' :
                                    'bg-emerald-50 text-emerald-600'
                                }`}>
                                    {getIcon(item.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-slate-900 truncate pr-6">{item.title}</h4>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                        <span>{item.dateAdded.toLocaleDateString()}</span>
                                        {item.fileName && (
                                            <>
                                                <span>•</span>
                                                <span className="truncate max-w-[120px]">{item.fileName}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <p className="text-slate-600 text-xs leading-relaxed line-clamp-3 font-mono">
                                    {item.content}
                                </p>
                            </div>
                        </div>
                    ))}
                    
                    {items.length === 0 && (
                        <div className="col-span-full py-16 text-center text-slate-500 bg-slate-50 rounded-2xl border-dashed border-2 border-slate-200">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FileText className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900">No resources yet</h3>
                            <p className="max-w-xs mx-auto mt-1">Upload brochures, menus, or paste text to help the AI learn about your business.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBase;