import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, File, Image, FileText, Video, Music, Archive } from 'lucide-react';
import TactileButton from './TactileButton';

interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
  status: 'uploading' | 'complete' | 'error';
  progress: number;
  error?: string;
}

interface FileUploadProps {
  onFilesSelected?: (files: File[]) => void;
  onFileRemove?: (fileId: string) => void;
  maxFiles?: number;
  maxSize?: number; // in MB
  accept?: string;
  multiple?: boolean;
  className?: string;
  disabled?: boolean;
}

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return Image;
  if (type.startsWith('video/')) return Video;
  if (type.startsWith('audio/')) return Music;
  if (type.startsWith('text/')) return FileText;
  if (type.includes('zip') || type.includes('rar') || type.includes('tar')) return Archive;
  return File;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export const FileUpload: React.FC<FileUploadProps> = ({
  onFilesSelected,
  onFileRemove,
  maxFiles = 5,
  maxSize = 10, // 10MB default
  accept,
  multiple = true,
  className = '',
  disabled = false,
}) => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | undefined => {
    const maxSizeBytes = maxSize * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return `FILE_SIZE_EXCEEDS_${maxSize}MB`;
    }
    return undefined;
  };

  const createFilePreview = async (file: File): Promise<string | undefined> => {
    if (file.type.startsWith('image/')) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
    }
    return undefined;
  };

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || disabled) return;

      const newFiles: File[] = Array.from(fileList);

      if (files.length + newFiles.length > maxFiles) {
        console.warn(`MAX_${maxFiles}_FILES_EXCEEDED`);
        return;
      }

      const uploadedFiles: UploadedFile[] = [];

      for (const file of newFiles) {
        const error = validateFile(file);
        const preview = await createFilePreview(file);

        uploadedFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          preview,
          status: error ? 'error' : 'complete',
          progress: error ? 0 : 100,
          error,
        });
      }

      setFiles((prev) => [...prev, ...uploadedFiles]);
      onFilesSelected?.(newFiles);
    },
    [files.length, maxFiles, disabled, onFilesSelected]
  );

  const handleRemoveFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    onFileRemove?.(fileId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled) handleFiles(e.dataTransfer.files);
  };

  const handleClick = () => {
    if (!disabled) fileInputRef.current?.click();
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Upload Zone */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative p-8 cursor-pointer
          transition-all duration-200 glass
          ${
            isDragging
              ? 'neon-border-pulse border-dashed shadow-[0_0_30px_rgba(34,211,238,0.15),inset_0_0_20px_rgba(34,211,238,0.05)]'
              : 'neon-border border-dashed holo-interactive'
          }
          ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
          disabled={disabled}
        />

        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className={`p-4 transition-all ${
              isDragging
                ? 'glass-light neon-border-strong'
                : 'glass neon-border'
            }`}
          >
            <Upload
              size={32}
              className={`transition-colors ${
                isDragging ? 'text-cyan-400 neon-text-subtle' : 'text-zinc-600'
              }`}
            />
          </div>

          <div className="space-y-2">
            <p className="font-holo-label text-zinc-400" style={{ fontSize: '12px' }}>
              {isDragging ? 'DROP_FILES_HERE' : 'DRAG_&_DROP_OR_CLICK'}
            </p>
            <p className="font-holo-label text-zinc-600" style={{ fontSize: '10px', letterSpacing: '0.15em' }}>
              MAX_{maxFiles}_FILES • {maxSize}MB_EACH
            </p>
          </div>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="font-holo-label text-cyan-400 px-1 neon-text-subtle">
            UPLOADED_FILES ({files.length}/{maxFiles})
          </div>

          {files.map((uploadedFile) => {
            const Icon = getFileIcon(uploadedFile.file.type);

            return (
              <div
                key={uploadedFile.id}
                className={`
                  flex items-center gap-3 p-3 transition-all holo-interactive
                  ${
                    uploadedFile.status === 'error'
                      ? 'glass neon-border-red'
                      : 'glass-light neon-border'
                  }
                `}
              >
                {/* Preview or Icon */}
                <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center glass-light neon-border overflow-hidden">
                  {uploadedFile.preview ? (
                    <img
                      src={uploadedFile.preview}
                      alt={uploadedFile.file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Icon size={16} className="text-cyan-400/50" />
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-holo-data text-zinc-300 truncate">
                    {uploadedFile.file.name}
                  </div>
                  <div className="font-holo-data text-zinc-600 mt-0.5" style={{ fontSize: '10px' }}>
                    {formatFileSize(uploadedFile.file.size)}
                    {uploadedFile.status === 'error' && uploadedFile.error && (
                      <span className="neon-text-red ml-2">• {uploadedFile.error}</span>
                    )}
                  </div>
                </div>

                {/* Status & Remove */}
                <div className="flex items-center gap-2">
                  {uploadedFile.status === 'complete' && (
                    <div className="w-2 h-2 bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.6)]" />
                  )}
                  {uploadedFile.status === 'error' && (
                    <div className="w-2 h-2 bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
                  )}

                  <TactileButton
                    state="error"
                    onClick={() => handleRemoveFile(uploadedFile.id)}
                    icon={<X size={12} />}
                    className="!px-2 !py-1.5"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
