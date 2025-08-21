const config = require('../config');
const { Logger } = require('../lib/logger');

/**
 * Calculate PR complexity metrics
 */
function calculatePRComplexity(files) {
  const logger = Logger.createOperationLogger('calculatePRComplexity');
  
  const totalLines = files.reduce((sum, file) => {
    return sum + (file.patch ? file.patch.split('\n').length : 0);
  }, 0);
  
  const complexity = {
    fileCount: files.length,
    totalLines,
    canProcessHolistic: files.length <= config.LIMITS.MAX_FILES_HOLISTIC && 
                       totalLines <= config.LIMITS.MAX_TOTAL_LINES,
    needsBatching: files.length > config.LIMITS.MAX_FILES_HOLISTIC || 
                   totalLines > config.LIMITS.MAX_TOTAL_LINES
  };
  
  logger.debug('PR complexity calculated', complexity);
  return complexity;
}

/**
 * Create file batches for processing
 */
function createFileBatches(files) {
  const logger = Logger.createOperationLogger('createFileBatches');
  const batches = [];
  let currentBatch = [];
  let currentBatchLines = 0;
  let skippedFiles = 0;
  
  for (const file of files) {
    const fileLines = file.patch ? file.patch.split('\n').length : 0;
    
    // Skip files that are too large individually
    if (fileLines > config.LIMITS.MAX_FILE_LINES) {
      logger.warning(`Skipping file: too large`, { 
        filename: file.filename, 
        lines: fileLines, 
        limit: config.LIMITS.MAX_FILE_LINES 
      });
      skippedFiles++;
      continue;
    }
    
    // Start new batch if current would exceed limits
    if (currentBatch.length >= config.LIMITS.MAX_BATCH_SIZE || 
        currentBatchLines + fileLines > config.LIMITS.MAX_TOTAL_LINES) {
      if (currentBatch.length > 0) {
        batches.push([...currentBatch]);
        logger.debug(`Created batch ${batches.length}`, { 
          files: currentBatch.length, 
          lines: currentBatchLines 
        });
        currentBatch = [];
        currentBatchLines = 0;
      }
    }
    
    currentBatch.push(file);
    currentBatchLines += fileLines;
  }
  
  // Add final batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
    logger.debug(`Created final batch ${batches.length}`, { 
      files: currentBatch.length, 
      lines: currentBatchLines 
    });
  }
  
  logger.info(`File batching completed`, { 
    totalBatches: batches.length, 
    totalFiles: files.length, 
    skippedFiles 
  });
  
  return batches;
}

module.exports = {
  calculatePRComplexity,
  createFileBatches
};
