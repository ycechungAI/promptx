#!/usr/bin/env node

const path = require('path');
const fs = require('fs').promises;
const { glob } = require('glob');

/**
 * 生成资源注册表 - v2.0.0 格式
 * 扫描 @promptx/resource 包中的所有资源文件并生成注册表到 dist 目录
 * 注意：registry.json 是构建产物，不是源码的一部分
 */
async function generateRegistry() {
  try {
    console.log('🏗️ 开始生成资源注册表...');
    
    // 获取 resource 包根目录
    const packageRoot = path.join(__dirname, '..');
    console.log(`📁 资源包根目录: ${packageRoot}`);
    
    // 定义要扫描的资源目录
    const resourcesDir = path.join(packageRoot, 'resources');
    
    // v2.0.0 格式的注册表
    const registry = {
      version: '2.0.0',
      source: 'package',
      metadata: {
        version: '2.0.0',
        description: 'package 级资源注册表',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      resources: []
    };
    
    // 递归扫描 resources 目录
    await scanDirectory(resourcesDir, '', registry);
    
    // 更新元数据
    registry.metadata.resourceCount = registry.resources.length;
    
    // 确保 dist 目录存在
    const distDir = path.join(packageRoot, 'dist');
    await fs.mkdir(distDir, { recursive: true });
    
    // 保存注册表到 dist 目录
    const registryPath = path.join(distDir, 'registry.json');
    await fs.writeFile(
      registryPath,
      JSON.stringify(registry, null, 2),
      'utf-8'
    );
    
    console.log('✅ 资源注册表生成完成！');
    console.log(`📋 保存位置: ${registryPath}`);
    
    // 显示统计信息
    const stats = {};
    registry.resources.forEach(resource => {
      stats[resource.protocol] = (stats[resource.protocol] || 0) + 1;
    });
    
    console.log('\n📊 资源统计:');
    for (const [protocol, count] of Object.entries(stats)) {
      console.log(`   ${protocol}: ${count} 个`);
    }
    console.log(`   总计: ${registry.resources.length} 个资源\n`);
    
  } catch (error) {
    console.error('❌ 生成注册表失败:', error.message);
    process.exit(1);
  }
}

/**
 * 递归扫描目录
 * @param {string} currentPath - 当前扫描路径
 * @param {string} relativePath - 相对于 resources 目录的路径
 * @param {Object} registry - 注册表对象
 */
async function scanDirectory(currentPath, relativePath, registry) {
  try {
    const items = await fs.readdir(currentPath);
    
    for (const item of items) {
      const itemPath = path.join(currentPath, item);
      const stat = await fs.stat(itemPath);
      const newRelativePath = relativePath ? `${relativePath}/${item}` : item;
      
      if (stat.isDirectory()) {
        // 递归扫描子目录
        await scanDirectory(itemPath, newRelativePath, registry);
      } else {
        // 处理文件
        await processFile(itemPath, newRelativePath, registry, stat);
      }
    }
  } catch (error) {
    console.warn(`⚠️ 扫描 ${currentPath} 失败: ${error.message}`);
  }
}

/**
 * 处理单个文件
 * @param {string} filePath - 文件完整路径
 * @param {string} relativePath - 相对路径
 * @param {Object} registry - 注册表对象
 * @param {Object} stat - 文件状态信息
 */
async function processFile(filePath, relativePath, registry, stat) {
  const fileName = path.basename(filePath);
  let protocol = null;
  let resourceId = null;
  
  // 根据文件名后缀识别资源类型（与 ProjectDiscovery 保持一致）
  if (fileName.endsWith('.role.md')) {
    protocol = 'role';
    resourceId = path.basename(fileName, '.role.md');
  } else if (fileName.endsWith('.thought.md')) {
    protocol = 'thought';
    resourceId = path.basename(fileName, '.thought.md');
  } else if (fileName.endsWith('.execution.md')) {
    protocol = 'execution';
    resourceId = path.basename(fileName, '.execution.md');
  } else if (fileName.endsWith('.knowledge.md')) {
    protocol = 'knowledge';
    resourceId = path.basename(fileName, '.knowledge.md');
  } else if (fileName.endsWith('.tool.js')) {
    protocol = 'tool';
    resourceId = path.basename(fileName, '.tool.js');
  } else if (fileName.endsWith('.manual.md')) {
    protocol = 'manual';
    resourceId = path.basename(fileName, '.manual.md');
  } else if (fileName.endsWith('.protocol.md')) {
    protocol = 'protocol';
    resourceId = path.basename(fileName, '.protocol.md');
  } else if (fileName.endsWith('.tag.md')) {
    protocol = 'tag';
    resourceId = path.basename(fileName, '.tag.md');
  }
  
  if (protocol && resourceId) {
    // 尝试提取标题和描述
    let title = resourceId;
    let description = '';
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      if (fileName.endsWith('.md')) {
        // 从 Markdown 提取第一个标题
        const titleMatch = content.match(/^#\s+(.+)$/m);
        if (titleMatch) {
          title = titleMatch[1];
        }
        // 提取描述（第一个非标题段落）
        const descMatch = content.match(/^#[^\n]+\n\n([^\n#]+)/);
        if (descMatch) {
          description = descMatch[1].trim().substring(0, 100); // 限制长度
        }
      } else if (fileName.endsWith('.js')) {
        // 从 JavaScript 提取 JSDoc 注释
        const jsdocMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\n/);
        if (jsdocMatch) {
          title = jsdocMatch[1];
        }
      }
    } catch (e) {
      // 读取文件失败，使用默认值
    }
    
    // 添加资源到注册表
    registry.resources.push({
      id: resourceId,
      source: 'package',
      protocol: protocol,
      name: title,
      description: description || generateDefaultDescription(resourceId, protocol),
      reference: `@package://resources/${relativePath}`,
      metadata: {
        path: `resources/${relativePath}`,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString()
      }
    });
    
    console.log(`   ✓ 发现 ${protocol} 资源: ${resourceId}`);
  }
}

/**
 * 生成默认描述
 * @param {string} id - 资源 ID
 * @param {string} protocol - 资源协议
 * @returns {string} 默认描述
 */
function generateDefaultDescription(id, protocol) {
  const typeNames = {
    'role': '角色',
    'thought': '思维模式',
    'execution': '执行模式',
    'knowledge': '知识体系',
    'tool': '工具',
    'manual': '使用手册',
    'protocol': '协议',
    'tag': '标签'
  };
  
  const typeName = typeNames[protocol] || '资源';
  return `${id} ${typeName}`;
}

// 如果直接运行此脚本
if (require.main === module) {
  generateRegistry();
}

module.exports = generateRegistry;