/**
 * ast-extractor.js - [解法 2] 靜態代碼與解構語法推導器
 * 從前端元件 (JSX/TSX/Vue/JS) 逆向推測所需的「最小可用 Mock (Seed Mock)」
 */

const fs = require('fs');
const path = require('path');

class AstMockExtractor {
  extractFromFiles(filePaths) {
    let combinedSchema = {};

    for (const file of filePaths) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const fileSchema = this.extractFromContent(content);
      combinedSchema = this.deepMerge(combinedSchema, fileSchema);
    }

    return combinedSchema;
  }

  extractFromContent(code) {
    const schema = {};

    // 1. 捕捉解構語法: const { a, b, list } = res.data / response / props / state
    const destructureRegex = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*([a-zA-Z0-9_$.]+)/g;
    let match;
    while ((match = destructureRegex.exec(code)) !== null) {
      const fields = match[1].split(',').map(f => f.trim().split(':')[0].trim()).filter(Boolean);
      const source = match[2];

      const targetObj = this.ensurePath(schema, source);
      fields.forEach(field => {
        if (!targetObj[field]) {
          targetObj[field] = this.inferDefaultValue(field, code);
        }
      });
    }

    // 2. 捕捉鏈式取值: e.g. user.profile.level 或 data?.items?.length
    const chainRegex = /([a-zA-Z0-9_$]+)(?:\?\.|\.)([a-zA-Z0-9_$]+)(?:\?\.|\.)([a-zA-Z0-9_$]+)/g;
    while ((match = chainRegex.exec(code)) !== null) {
      const root = match[1];
      const p1 = match[2];
      const p2 = match[3];

      // 排除常見全域
      if (['window', 'document', 'console', 'Math', 'JSON', 'Object', 'Array', 'React'].includes(root)) {
        continue;
      }

      // 確保 root 是 object
      if (!schema[root] || typeof schema[root] !== 'object' || Array.isArray(schema[root])) {
        schema[root] = {};
      }
      if (!schema[root][p1] || typeof schema[root][p1] !== 'object' || Array.isArray(schema[root][p1])) {
        schema[root][p1] = {};
      }
      if (!schema[root][p1][p2]) {
        schema[root][p1][p2] = this.inferDefaultValue(p2, code);
      }
    }

    // 3. 捕捉陣列遍歷: e.g. items.map / list.forEach
    const arrayRegex = /([a-zA-Z0-9_$.]+)\.(?:map|forEach|filter|find)/g;
    while ((match = arrayRegex.exec(code)) !== null) {
      const arrPath = match[1];
      if (['Object.keys', 'Object.values', 'Array'].includes(arrPath)) continue;

      this.ensurePath(schema, arrPath, 'array');
    }

    // 4. 捕捉 TypeScript interface 與 type 宣告
    const tsDefinitions = this.extractFromTypeScriptDefinitions(code);
    return this.deepMerge(schema, tsDefinitions);
  }

  extractFromTypeScriptDefinitions(code) {
    const result = {};
    const ifaceRegex = /(?:interface|type)\s+([A-Za-z0-9_]+)(?:<[^>]+>)?\s*=?\s*\{([\s\S]*?)\n\s*\}/g;
    let match;
    while ((match = ifaceRegex.exec(code)) !== null) {
      const typeName = match[1];
      const body = match[2];
      const fields = {};

      const lineRegex = /([a-zA-Z0-9_$]+)\s*\??\s*:\s*([^;,\n]+)/g;
      let fieldMatch;
      while ((fieldMatch = lineRegex.exec(body)) !== null) {
        const fieldName = fieldMatch[1].trim();
        const rawType = fieldMatch[2].trim().toLowerCase();

        if (rawType.includes('[]') || rawType.startsWith('array<')) {
          fields[fieldName] = [{ id: 1, name: `Sample ${fieldName}` }];
        } else if (rawType.includes('number')) {
          fields[fieldName] = 100;
        } else if (rawType.includes('boolean')) {
          fields[fieldName] = true;
        } else if (rawType.includes('string')) {
          fields[fieldName] = `Sample ${fieldName}`;
        } else if (rawType.includes('{') || rawType.includes('object') || rawType.includes('record')) {
          fields[fieldName] = { id: 1 };
        } else {
          fields[fieldName] = this.inferDefaultValue(fieldName, code);
        }
      }

      if (Object.keys(fields).length > 0) {
        const keyName = typeName.replace(/Props$|State$|Schema$|Type$|Interface$/i, '').toLowerCase() || typeName.toLowerCase();
        result[keyName] = fields;
      }
    }
    return result;
  }

  ensurePath(obj, dotPath, finalType = 'object') {
    const parts = dotPath.split('.').filter(p => !['res', 'response', 'data', 'props', 'state'].includes(p));
    if (parts.length === 0) return obj;

    let current = obj;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1 && finalType === 'array') {
        if (!Array.isArray(current[part])) {
          current[part] = [{ id: 1, title: 'Sample Item', name: 'Sample Item' }];
        }
      } else {
        if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) {
          current[part] = {};
        }
        current = current[part];
      }
    }
    return current;
  }

  inferDefaultValue(fieldName, fullCode) {
    const lower = fieldName.toLowerCase();
    if (lower.includes('list') || lower.includes('items') || lower.includes('records') || lower.includes('orders')) {
      return [{ id: 1, title: 'Sample Item', name: 'Sample Item', price: 100 }];
    }
    if (lower.includes('user') || lower.includes('profile') || lower.includes('account')) {
      return { id: 1, name: 'Sample User', level: 1 };
    }
    if (lower.includes('is') || lower.includes('has') || lower.includes('enable') || lower.includes('show')) {
      return true;
    }
    if (lower.includes('count') || lower.includes('total') || lower.includes('price') || lower.includes('amount') || lower.includes('id') || lower.includes('page') || lower.includes('level')) {
      return 100;
    }
    return `Mock ${fieldName}`;
  }

  deepMerge(target, source) {
    const output = { ...target };
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) Object.assign(output, { [key]: source[key] });
          else output[key] = this.deepMerge(target[key], source[key]);
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}

module.exports = { AstMockExtractor };
