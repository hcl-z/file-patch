import { promises as fs } from 'fs';
import { resolve, basename, join } from 'path';
import { createPatch as diffCreate, parsePatch, applyPatch as diffApply } from 'diff';

const PATCHES_DIR = 'patches';

interface PatchError extends Error {
  code?: string;
}

async function ensurePatchesDir(): Promise<void> {
  try {
    await fs.mkdir(PATCHES_DIR, { recursive: true });
  } catch (error) {
    const patchError = error as PatchError;
    if (patchError.code !== 'EEXIST') {
      throw error;
    }
  }
}

export async function createPatch(filePath: string): Promise<void> {
  const absoluteFilePath = resolve(filePath);
  const fileName = basename(filePath);
  const patchDir = join(PATCHES_DIR, fileName);

  // 确保patches目录存在
  await ensurePatchesDir();
  
  // 创建文件特定的patch目录
  await fs.mkdir(patchDir, { recursive: true });

  // 复制原文件到patch目录
  const originalContent = await fs.readFile(absoluteFilePath, 'utf-8');
  const copyPath = join(patchDir, fileName);
  await fs.writeFile(copyPath, originalContent);

  // 保存原始文件路径
  await fs.writeFile(
    join(patchDir, 'original-path.txt'),
    absoluteFilePath
  );
}

export async function commitPatch(filePath: string): Promise<void> {
  const fileName = basename(filePath);
  const patchDir = join(PATCHES_DIR, fileName);
  const copyPath = join(patchDir, fileName);
  
  // 读取原始文件和修改后的文件
  const originalContent = await fs.readFile(filePath, 'utf-8');
  const modifiedContent = await fs.readFile(copyPath, 'utf-8');
  
  // 生成差异文件
  const patchContent = diffCreate(
    fileName,
    originalContent,
    modifiedContent,
    'original',
    'modified'
  );
  
  // 保存patch文件
  const patchPath = join(patchDir, `${fileName}.patch`);
  await fs.writeFile(patchPath, patchContent);
  
  // 删除多余文件，只保留patch文件
  await fs.unlink(copyPath).catch(() => {});
}

export async function applyPatch(filePath: string): Promise<void> {
  const fileName = basename(filePath);
  const patchDir = join(PATCHES_DIR, fileName);
  
  // 检查patch文件是否存在
  const patchPath = join(patchDir, `${fileName}.patch`);
  await fs.access(patchPath);
  
  // 读取原始文件内容
  const originalContent = await fs.readFile(filePath, 'utf-8');
  
  // 读取patch文件
  const patchContent = await fs.readFile(patchPath, 'utf-8');
  
  // 应用patch生成修改后的内容，使用宽松模式
  const patches = parsePatch(patchContent, { strict: false });
  
  // 尝试应用patch，使用fuzz因子增加容错性
  let result = diffApply(originalContent, patches[0], {
    fuzzFactor: 3,    
  });
  
  // 如果常规应用失败，尝试更宽松的应用方式
  if (result === false) {
    throw new Error('Failed to apply patch');
  }
  
  // 保存修改后的文件作为patched版本
  const patchedPath = join(patchDir, `${fileName}.patched`);
  await fs.writeFile(patchedPath, result);
  
  // 备份原始文件
  const backupPath = join(patchDir, `${fileName}.original.backup`);
  await fs.copyFile(filePath, backupPath);
  
  // 删除原始文件
  await fs.unlink(filePath);
  
  // 创建软链接到patched文件
  await fs.symlink(patchedPath, filePath);
}

// 手动应用patch的辅助函数
function applyPatchManually(content: string, patch: any): string {
  const lines = content.split('\n');
  const hunks = patch.hunks || [];
  
  // 按照行号从大到小排序，避免修改后的行号影响后续修改
  hunks.sort((a: any, b: any) => b.oldStart - a.oldStart);
  
  for (const hunk of hunks) {
    let lineIndex = hunk.oldStart - 1; // 转为0基索引
    let addedLines = 0;
    
    for (const change of hunk.lines) {
      if (change.startsWith('-')) {
        // 删除行
        if (lineIndex < lines.length) {
          lines.splice(lineIndex, 1);
        }
      } else if (change.startsWith('+')) {
        // 添加行
        lines.splice(lineIndex, 0, change.substring(1));
        lineIndex++;
        addedLines++;
      } else if (!change.startsWith('\\')) {
        // 上下文行或空行，跳过
        lineIndex++;
      }
    }
  }
  
  return lines.join('\n');
}

export async function revertPatch(filePath: string): Promise<void> {
  const fileName = basename(filePath);
  const patchDir = join(PATCHES_DIR, fileName);
  
  // 检查备份文件是否存在
  const backupPath = join(patchDir, `${fileName}.original.backup`);
  const patchedPath = join(patchDir, `${fileName}.patched`);
  await fs.access(backupPath);
  
  // 检查是否为软链接
  const stats = await fs.lstat(filePath);
  if (stats.isSymbolicLink()) {
    // 删除软链接
    await fs.unlink(filePath);
    
    // 恢复原始文件
    await fs.copyFile(backupPath, filePath);
    
    // 删除备份文件
    await fs.unlink(backupPath).catch(() => {});
    await fs.unlink(patchedPath).catch(() => {});
  }
} 