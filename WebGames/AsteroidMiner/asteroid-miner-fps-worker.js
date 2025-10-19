// ================================
// FPS COUNTER WORKER
// Handles FPS calculation off the main thread
// Runs independently to minimize impact on game performance
// ================================

let fpsFrames = 0;
let fpsLastTime = 0;
let fpsEnabled = false;
let frameTimestamps = []; // Store last 60 frame timestamps for rolling average

// Message handler
self.onmessage = function(e) {
    const { type, timestamp } = e.data;
    
    switch(type) {
        case 'init':
            fpsFrames = 0;
            fpsLastTime = timestamp || performance.now();
            frameTimestamps = [];
            self.postMessage({ type: 'ready' });
            break;
            
        case 'enable':
            fpsEnabled = true;
            fpsFrames = 0;
            fpsLastTime = timestamp || performance.now();
            frameTimestamps = [];
            break;
            
        case 'disable':
            fpsEnabled = false;
            fpsFrames = 0;
            frameTimestamps = [];
            break;
            
        case 'frame':
            if (!fpsEnabled) return;
            
            const currentTime = timestamp || performance.now();
            
            // Add current timestamp to rolling buffer
            frameTimestamps.push(currentTime);
            
            // Keep only last 60 frames for rolling average
            if (frameTimestamps.length > 60) {
                frameTimestamps.shift();
            }
            
            // Calculate FPS every 10 frames for smoother updates
            fpsFrames++;
            if (fpsFrames >= 10 && frameTimestamps.length >= 2) {
                // Calculate average FPS over the last N frames
                const timeSpan = frameTimestamps[frameTimestamps.length - 1] - frameTimestamps[0];
                const numFrames = frameTimestamps.length - 1;
                
                if (timeSpan > 0) {
                    const fps = Math.round((numFrames / timeSpan) * 1000);
                    
                    self.postMessage({
                        type: 'fpsUpdate',
                        fps: fps
                    });
                }
                
                fpsFrames = 0;
            }
            break;
    }
};
