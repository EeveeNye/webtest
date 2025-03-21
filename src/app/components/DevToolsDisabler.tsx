'use client';

import { useEffect } from 'react';

interface DevTools {
  isOpen: boolean;
  orientation: 'vertical' | 'horizontal' | undefined;
}

declare global {
  interface Window {
    Firebug?: {
      chrome?: {
        isInitialized?: boolean;
      };
    };
  }

  interface WindowEventMap {
    'devtoolschange': CustomEvent<DevTools>;
  }
}

export default function DevToolsDisabler() {
  useEffect(() => {
    // 禁用开发工具
    if (process.env.NODE_ENV === 'development') {
      const devtools: DevTools = {
        isOpen: false,
        orientation: undefined,
      };
      
      const threshold = 160;
      
      const emitEvent = (isOpen: boolean, orientation: 'vertical' | 'horizontal' | undefined) => {
        window.dispatchEvent(new CustomEvent('devtoolschange', {
          detail: {
            isOpen,
            orientation,
          },
        }));
      };

      const main = ({emitEvents = true} = {}) => {
        const widthThreshold = window.outerWidth - window.innerWidth > threshold;
        const heightThreshold = window.outerHeight - window.innerHeight > threshold;
        const orientation = widthThreshold ? 'vertical' as const : 'horizontal' as const;

        if (
          !(heightThreshold && widthThreshold) &&
          ((window.Firebug?.chrome?.isInitialized) || widthThreshold || heightThreshold)
        ) {
          if ((!devtools.isOpen || devtools.orientation !== orientation) && emitEvents) {
            emitEvent(true, orientation);
          }

          devtools.isOpen = true;
          devtools.orientation = orientation;
        } else {
          if (devtools.isOpen && emitEvents) {
            emitEvent(false, undefined);
          }

          devtools.isOpen = false;
          devtools.orientation = undefined;
        }
      };

      main({emitEvents: false});
      setInterval(main, 500);

      // 监听开发工具打开事件
      window.addEventListener('devtoolschange', (e) => {
        if (e.detail.isOpen) {
          // 如果开发工具被打开，刷新页面
          window.location.reload();
        }
      });
    }
  }, []);

  return null;
} 