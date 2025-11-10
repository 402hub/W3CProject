// media.js - Simplified Media Handler (No IPFS for MVP - faster!)
import { db } from './db';

/**
 * MediaHandler - Handles all media operations with local storage (faster than IPFS for MVP)
 */
export class MediaHandler {
  constructor() {
    this.uploadQueue = [];
    this.compressionQuality = 0.8;
    this.maxFileSize = 100 * 1024 * 1024; // 100MB limit
  }

  // ============ UPLOAD OPERATIONS ============

  /**
   * Upload file with compression and progress tracking
   * For MVP: Store locally as base64, can add IPFS later
   */
  async uploadFile(file, onProgress = () => {}) {
    try {
      if (file.size > this.maxFileSize) {
        throw new Error(`File too large. Max size: ${this.maxFileSize / 1024 / 1024}MB`);
      }

      const fileType = this.getFileType(file);
      const uploadStart = performance.now();
      
      // Compress if image
      let processedFile = file;
      if (fileType === 'image' && this.shouldCompress(file)) {
        processedFile = await this.compressImage(file);
        onProgress(50);
      }

      // Generate thumbnail
      let thumbnail = null;
      if (fileType === 'image') {
        thumbnail = await this.generateImageThumbnail(processedFile);
        onProgress(75);
      }

      // Convert to base64 for local storage
      const base64Data = await this.fileToBase64(processedFile);
      const thumbnailData = thumbnail ? await this.fileToBase64(thumbnail) : null;
      
      onProgress(100);
      const uploadTime = performance.now() - uploadStart;

      const mediaHash = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log(`✅ File processed in ${uploadTime.toFixed(2)}ms`);

      return {
        ipfsHash: mediaHash, // Using local ID instead of IPFS for MVP
        thumbnailHash: thumbnailData ? `thumb_${mediaHash}` : null,
        fileName: file.name,
        fileType,
        fileSize: processedFile.size,
        originalSize: file.size,
        uploadTime,
        data: base64Data,
        thumbnailData: thumbnailData,
        url: base64Data // Data URL for immediate display
      };

    } catch (error) {
      console.error('Upload error:', error);
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  /**
   * Convert file to base64
   */
  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ============ DOWNLOAD OPERATIONS ============

  /**
   * Download file from cache
   */
  async downloadFile(mediaHash, onProgress = () => {}) {
    try {
      const cached = await db.getCachedMedia(mediaHash);
      if (cached && cached.localUrl) {
        console.log('✅ Loaded from cache:', mediaHash);
        const response = await fetch(cached.localUrl);
        return await response.blob();
      }

      throw new Error('Media not found in cache');

    } catch (error) {
      console.error('Download error:', error);
      throw error;
    }
  }

  // ============ IMAGE PROCESSING ============

  async compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          
          let width = img.width;
          let height = img.height;
          const maxWidth = 1920;
          
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressedFile);
            },
            'image/jpeg',
            this.compressionQuality
          );
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async generateImageThumbnail(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const size = 200;
          
          canvas.width = size;
          canvas.height = size;

          const ctx = canvas.getContext('2d');
          
          const scale = Math.max(size / img.width, size / img.height);
          const x = (size / 2) - (img.width / 2) * scale;
          const y = (size / 2) - (img.height / 2) * scale;
          
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

          canvas.toBlob(
            (blob) => {
              const thumbFile = new File([blob], 'thumb_' + file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(thumbFile);
            },
            'image/jpeg',
            0.7
          );
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ============ UTILITIES ============

  getFileType(file) {
    const mimeType = file.type;
    
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf')) return 'pdf';
    
    return 'file';
  }

  shouldCompress(file) {
    return file.size > 500 * 1024;
  }

  getGatewayUrl(hash) {
    // For MVP, return the hash as-is (it's a data URL)
    return hash;
  }
}

// Singleton instance
export const mediaHandler = new MediaHandler();
