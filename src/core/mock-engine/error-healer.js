/**
 * error-healer.js - [解法 3] Runtime 報錯補全自癒器
 * 捕捉 TypeError，透過錯誤訊息中的屬性名稱反向 Patch 假資料
 */

class MockErrorHealer {
  /**
   * 根據錯誤訊息與堆疊修復 Mock 資料
   * @param {Object} currentMock 當前的 Mock JSON
   * @param {string} errorMessage 瀏覽器或執行期的報錯字串
   * @returns {Object} { healed: boolean, mock: Object, patchedField: string, reason: string }
   */
  heal(currentMock, errorMessage) {
    const cloned = JSON.parse(JSON.stringify(currentMock || {}));
    if (!errorMessage || typeof errorMessage !== 'string') {
      return { healed: false, mock: cloned, reason: 'No error message provided' };
    }

    // Pattern 1: Cannot read properties of undefined (reading 'xxx')
    // 或 Cannot read property 'xxx' of undefined / null
    const propMatch = errorMessage.match(/Cannot read propert(?:ies|y) (?:of undefined|of null) \(reading '([^']+)'\)/i)
      || errorMessage.match(/Cannot read property '([^']+)' of (?:undefined|null)/i);

    if (propMatch) {
      const missingProp = propMatch[1];
      const patched = this.patchProperty(cloned, missingProp);
      return {
        healed: true,
        mock: cloned,
        patchedField: missingProp,
        reason: `Patched missing property: ${missingProp}`
      };
    }

    // Pattern 2: xxx.map / forEach / filter is not a function (表示需要是陣列)
    const arrayMatch = errorMessage.match(/([a-zA-Z0-9_$]+)\.(?:map|forEach|filter|find) is not a function/i)
      || errorMessage.match(/([a-zA-Z0-9_$]+) is not iterable/i);

    if (arrayMatch) {
      const missingArrayProp = arrayMatch[1];
      this.patchArray(cloned, missingArrayProp);
      return {
        healed: true,
        mock: cloned,
        patchedField: missingArrayProp,
        reason: `Converted ${missingArrayProp} to Array`
      };
    }

    // Pattern 3: Cannot destructure property 'xxx' of ... as it is undefined
    const destructureMatch = errorMessage.match(/Cannot destructure property '([^']+)'/i);
    if (destructureMatch) {
      const missingProp = destructureMatch[1];
      this.patchProperty(cloned, missingProp);
      return {
        healed: true,
        mock: cloned,
        patchedField: missingProp,
        reason: `Patched destructured field: ${missingProp}`
      };
    }

    return {
      healed: false,
      mock: cloned,
      reason: 'Error pattern not recognized for auto-healing'
    };
  }

  /**
   * 遞迴在物件最有可能的底層或根層補上該屬性
   */
  patchProperty(obj, propName) {
    const isArrType = propName.toLowerCase().includes('list') || propName.toLowerCase().includes('items');
    const defaultVal = isArrType ? [{ id: 1, name: `Mock ${propName} Item` }] : { id: 1, name: `Mock ${propName}` };

    // 優先檢查是否有常見的容器如 data, result, response
    const containers = ['data', 'result', 'response', 'body', 'user', 'profile'];
    for (const c of containers) {
      if (obj[c] && typeof obj[c] === 'object' && !Array.isArray(obj[c])) {
        if (!(propName in obj[c])) {
          obj[c][propName] = defaultVal;
          return true;
        }
      }
    }

    // 如果沒有，直接補在根物件
    if (!(propName in obj)) {
      obj[propName] = defaultVal;
      return true;
    }

    return false;
  }

  patchArray(obj, propName) {
    if (obj[propName] && !Array.isArray(obj[propName])) {
      obj[propName] = [{ id: 1, title: 'Sample' }];
      return;
    }
    const containers = ['data', 'result', 'response'];
    for (const c of containers) {
      if (obj[c] && typeof obj[c] === 'object' && !Array.isArray(obj[c])) {
        obj[c][propName] = [{ id: 1, title: 'Sample' }];
        return;
      }
    }
    obj[propName] = [{ id: 1, title: 'Sample' }];
  }
}

module.exports = { MockErrorHealer };
