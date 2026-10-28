import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

/**
 * 媒体内容提取器
 * 负责提取图片、视频、音频，并支持下载图片到本地
 */
class MediaExtractor {
  /**
   * 执行提取
   * @param {Object} context - 解析上下文 { page, url, options, data }
   * @returns {Promise<Object>} 提取的数据
   */
  async extract(context) {
    const { page, options } = context;
    const { filepath, pagesDir } = options;
    
    const videos = await this.extractVideos(page);
    const audios = await this.extractAudios(page);
    
    // 提取并可能下载图片
    let images = [];
    if (filepath && pagesDir) {
      images = await this.extractAndDownloadImages(page, filepath, pagesDir);
      
      // 同步更新 mainContent 中的图片路径 (如果 text-extractor 已经运行并生成了 mainContent)
      if (context.data && context.data.mainContent) {
        await this.syncMainContentImagePaths(context.data.mainContent, images, filepath, pagesDir);
      }
    } else {
      // 仅提取不下载
      images = await page.evaluate(() => {
        const imgElements = document.querySelectorAll('img');
        return Array.from(imgElements).map((img, index) => ({
          src: img.src,
          alt: img.alt || '',
          title: img.title || '',
          index: index + 1
        }));
      });
    }

    return {
      images,
      videos,
      audios
    };
  }

  async extractVideos(page) {
    try {
      return await page.evaluate(() => {
        const elements = document.querySelectorAll('video');
        return Array.from(elements).map(video => ({
          src: video.src || (video.querySelector('source') ? video.querySelector('source').src : ''),
          poster: video.poster || '',
          width: video.width || '',
          height: video.height || ''
        })).filter(v => v.src);
      });
    } catch (error) {
      return [];
    }
  }

  async extractAudios(page) {
    try {
      return await page.evaluate(() => {
        const elements = document.querySelectorAll('audio');
        return Array.from(elements).map(audio => ({
          src: audio.src || (audio.querySelector('source') ? audio.querySelector('source').src : '')
        })).filter(a => a.src);
      });
    } catch (error) {
      return [];
    }
  }

  async extractAndDownloadImages(page, filepath, pagesDir) {
    try {
      const baseFilename = path.basename(filepath, '.md');
      const imagesDir = path.join(pagesDir, baseFilename);
      
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }
      
      const images = await page.evaluate(() => {
        const imgElements = document.querySelectorAll('img');
        return Array.from(imgElements).map((img, index) => ({
          src: img.src,
          alt: img.alt || '',
          title: img.title || '',
          index: index + 1
        }));
      });
      
      const downloadedImages = [];
      
      for (const img of images) {
        try {
          if (!img.src || img.src.startsWith('data:')) {
            continue;
          }
          
          const urlObj = new URL(img.src);
          let ext = path.extname(urlObj.pathname) || '.jpg';
          if (!ext.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
            ext = '.jpg';
          }
          
          const localFilename = `image_${img.index}${ext}`;
          const localPath = path.join(imagesDir, localFilename);
          
          await new Promise((resolve) => {
            const protocol = img.src.startsWith('https') ? https : http;
            const file = fs.createWriteStream(localPath);
            
            protocol.get(img.src, (response) => {
              if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                  file.close();
                  resolve();
                });
              } else {
                file.close();
                if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                resolve();
              }
            }).on('error', () => {
              file.close();
              if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
              resolve();
            });
          });
          
          downloadedImages.push({
            src: img.src,
            localPath: `${baseFilename}/${localFilename}`,
            alt: img.alt,
            title: img.title
          });
        } catch (error) {
          console.error(`Error downloading image ${img.src}:`, error.message);
        }
      }
      
      return downloadedImages;
    } catch (error) {
      console.error('Failed to extract images:', error.message);
      return [];
    }
  }

  async syncMainContentImagePaths(mainContent, downloadedImages, filepath, pagesDir) {
    const baseFilename = path.basename(filepath, '.md');
    const contentDir = path.join(pagesDir, baseFilename);
    
    for (const item of mainContent) {
      if (item.type === 'image' && item.src && !item.src.startsWith('data:')) {
        try {
          const urlObj = new URL(item.src);
          let ext = path.extname(urlObj.pathname) || '.jpg';
          if (!ext.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
            ext = '.jpg';
          }
          
          const localFilename = `image_${item.index}${ext}`;
          const localPath = path.join(contentDir, localFilename);
          
          // 如果文件存在（通常由前面的 extractAndDownloadImages 下载），则更新路径
          if (fs.existsSync(localPath)) {
            item.localPath = `${baseFilename}/${localFilename}`;
          } else {
            // 如果不存在，尝试自己下载
            await new Promise((resolve) => {
              const protocol = item.src.startsWith('https') ? https : http;
              const file = fs.createWriteStream(localPath);
              
              protocol.get(item.src, (response) => {
                if (response.statusCode === 200) {
                  response.pipe(file);
                  file.on('finish', () => {
                    file.close();
                    resolve();
                  });
                } else {
                  file.close();
                  fs.unlinkSync(localPath);
                  resolve();
                }
              }).on('error', () => {
                file.close();
                if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                resolve();
              });
            });
            item.localPath = `${baseFilename}/${localFilename}`;
          }
        } catch (error) {
          // ignore
        }
      }
    }
  }
}

export default MediaExtractor;
