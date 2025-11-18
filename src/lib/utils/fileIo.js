export default {
  isJSON(file) {
    return file && file.type === 'application/json'
  },
  isNDJSON(file) {
    return file && file.name.endsWith('.ndjson')
  },
  isExcel(file) {
    if (!file) return false
    const excelTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ]
    return file.type
      ? excelTypes.includes(file.type)
      : /\.(xlsx|xls)$/i.test(file.name)
  },
  isDatabase(file) {
    const dbTypes = ['application/vnd.sqlite3', 'application/x-sqlite3']
    return file.type
      ? dbTypes.includes(file.type)
      : /\.(db|sqlite(3)?)+$/.test(file.name)
  },

  getFileName(file) {
    return file.name.replace(/\.[^.]+$/, '')
  },

  downloadFromUrl(url, fileName) {
    // Create downloader
    const downloader = document.createElement('a')
    downloader.href = url
    downloader.download = fileName

    // Trigger click
    downloader.click()

    // Clean up
    URL.revokeObjectURL(url)
  },

  async exportToFile(str, fileName, type = 'octet/stream') {
    const blob = new Blob([str], { type })
    const url = URL.createObjectURL(blob)
    this.downloadFromUrl(url, fileName)
  },

  async saveToFolder(str, fileName, type = 'text/html') {
    try {
      // 使用File System Access API（需要HTTPS环境或在本地开发环境下使用）
      if ('showDirectoryPicker' in window && window.isSecureContext) {
        const directoryHandle = await window.showDirectoryPicker({
          id: 'sqliteviz-html-exports',
          mode: 'readwrite'
        })
        
        // 创建文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
        const finalFileName = `${cleanFileName}_${timestamp}.html`
        
        // 创建文件
        const fileHandle = await directoryHandle.getFileHandle(finalFileName, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(str)
        await writable.close()
        
        // 返回保存信息
        return {
          success: true,
          fileName: finalFileName,
          folderName: directoryHandle.name
        }
      } else {
        // 浏览器不支持File System Access API或不是安全环境，返回失败状态
        return {
          success: false,
          error: 'browser_not_supported',
          message: '您的浏览器不支持本地文件夹保存功能'
        }
      }
    } catch (error) {
      console.error('Save to folder failed:', error)
      // 如果用户取消选择文件夹，返回取消状态
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'user_cancelled',
          message: '用户取消文件夹选择'
        }
      }
      // 其他错误也返回失败状态
      return {
        success: false,
        error: 'unknown_error',
        message: error.message
      }
    }
  },

  /**
   * 保存文件到浏览器临时存储中
   * @param {string} str - 文件内容
   * @param {string} fileName - 文件名（基于查询语句）
   * @param {string} type - 文件类型
   * @returns {Promise<Object>} 保存结果
   */
  async saveToTempStorage(str, fileName, type = 'text/html') {
    try {
      // 打开或创建IndexedDB数据库
      const dbName = 'sqliteviz_temp_files';
      const dbVersion = 1;
      
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);
        
        request.onerror = () => reject(new Error('无法打开数据库'));
        
        request.onsuccess = (event) => {
          const db = event.target.result;
          
          // 创建事务并保存文件
          const transaction = db.transaction(['files'], 'readwrite');
          const store = transaction.objectStore('files');
          
          // 清理文件名
          const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_') + '.html';
          
          // 创建文件对象
          const fileObject = {
            id: Date.now(),
            fileName: cleanFileName,
            content: str,
            type: type,
            timestamp: new Date().toISOString(),
            size: new Blob([str]).size
          };
          
          const putRequest = store.put(fileObject);
          
          putRequest.onsuccess = () => {
            resolve({
              success: true,
              fileName: cleanFileName,
              id: fileObject.id,
              timestamp: fileObject.timestamp,
              size: fileObject.size,
              message: '文件已保存到浏览器临时存储中'
            });
          };
          
          putRequest.onerror = () => {
            reject(new Error('保存文件失败'));
          };
        };
        
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          
          // 创建对象存储空间
          if (!db.objectStoreNames.contains('files')) {
            const store = db.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
            store.createIndex('fileName', 'fileName', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });
    } catch (error) {
      console.error('Save to temp storage failed:', error);
      return {
        success: false,
        error: 'storage_error',
        message: error.message
      };
    }
  },

  /**
   * Note: if user press Cancel in file choosing dialog
   * it will be an unsettled promise. But it's grabbed by
   * the garbage collector (tested with FinalizationRegistry).
   */
  getFileFromUser(type) {
    return new Promise(resolve => {
      const uploader = document.createElement('input')

      uploader.type = 'file'
      uploader.accept = type

      uploader.addEventListener('change', () => {
        const file = uploader.files[0]
        resolve(file)
      })

      uploader.click()
    })
  },

  importFile() {
    return this.getFileFromUser('.json').then(file => {
      return this.getFileContent(file)
    })
  },

  getFileContent(file) {
    const reader = new FileReader()
    return new Promise(resolve => {
      reader.onload = e => resolve(e.target.result)
      reader.readAsText(file)
    })
  },

  readFile(path) {
    return fetch(path)
  },

  readAsArrayBuffer(file) {
    const fileReader = new FileReader()

    return new Promise((resolve, reject) => {
      fileReader.onerror = () => {
        fileReader.abort()
        reject(new Error('Problem parsing input file.'))
      }

      fileReader.onload = () => {
        resolve(fileReader.result)
      }
      fileReader.readAsArrayBuffer(file)
    })
  }
}
