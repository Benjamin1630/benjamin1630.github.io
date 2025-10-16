// ================================
// FPS COUNTER WORKER
// Handles FPS calculation off the main thread
// Runs independently to minimize impact on game performance
// ================================

let fpsFrames = 0;
let fpsLastTime = 0;
let fpsEnabled = false;

// Message handler
self.onmessage = function(e) {
    const { type, timestamp } = e.data;
    
    switch(type) {
        case 'init':
            fpsFrames = 0;
            fpsLastTime = timestamp || performance.now();
            self.postMessage({ type: 'ready' });
            break;
            
        case 'enable':
            fpsEnabled = true;
            fpsFrames = 0;
            fpsLastTime = timestamp || performance.now();
            break;
            
        case 'disable':
            fpsEnabled = false;
            fpsFrames = 0;
            break;
            
        case 'frame':
            if (!fpsEnabled) return;
            
            fpsFrames++;
            const currentTime = timestamp || performance.now();
            const elapsed = currentTime - fpsLastTime;
            
            // Update once per second for efficiency
            if (elapsed >= 1000) {
                const fps = Math.round((fpsFrames * 1000) / elapsed);
                
                self.postMessage({
                    type: 'fpsUpdate',
                    fps: fps
                });
                
                fpsFrames = 0;
                fpsLastTime = currentTime;
            }
            break;
    }
};
