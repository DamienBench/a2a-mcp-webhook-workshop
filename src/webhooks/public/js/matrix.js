// Matrix rain animation for terminal background
document.addEventListener('DOMContentLoaded', function() {
  const canvas = document.getElementById('matrix-canvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  // Set canvas dimensions to fill container
  function resizeCanvas() {
    const terminalElement = document.querySelector('.terminal');
    if (!terminalElement) return;
    
    // Set canvas size to terminal size
    canvas.width = terminalElement.offsetWidth;
    canvas.height = terminalElement.offsetHeight;
    
    // Log canvas dimensions for debugging
    console.log('Matrix canvas resized to:', canvas.width, 'x', canvas.height);
    
    // If canvas has no size, try setting a minimum size
    if (canvas.width === 0 || canvas.height === 0) {
      console.log('Terminal element dimensions:', 
                 terminalElement.offsetWidth, 'x', terminalElement.offsetHeight,
                 'Setting minimum size');
      canvas.width = terminalElement.clientWidth || 800;
      canvas.height = terminalElement.clientHeight || 400;
    }
  }
  
  // Delay initial resize to ensure terminal is rendered
  setTimeout(function() {
    resizeCanvas();
    initMatrix();
  }, 500);
  
  // Handle window resize
  window.addEventListener('resize', resizeCanvas);
  
  // Initialize and run matrix animation
  function initMatrix() {
    // Matrix rain variables
    const fontSize = 7;
    const columns = Math.floor(canvas.width / fontSize) || 100;
    const drops = [];
    
    // Initialize drops at random positions
    for (let i = 0; i < columns; i++) {
      drops[i] = Math.floor(Math.random() * canvas.height / fontSize);
    }
    
    // Characters to display (expanded set for more variety)
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    
    // Draw function
    function draw() {
      // Check if canvas has dimensions
      if (canvas.width === 0 || canvas.height === 0) {
        resizeCanvas();
        return; // Skip this frame if still no dimensions
      }
      
      // Semi-transparent black background to create fade effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // More transparent for better contrast
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Set the text color to a more visible but still subtle green
      ctx.fillStyle = 'rgba(0, 180, 85, 0.25)'; // Brighter green with slightly more opacity
      ctx.font = fontSize + 'px monospace';
      
      // For each column
      for (let i = 0; i < drops.length; i++) {
        // Choose a random character
        const text = chars.charAt(Math.floor(Math.random() * chars.length));
        
        // Draw the character
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        
        // Highlight certain characters occasionally
        if (Math.random() > 0.95) {
          // Draw some characters in brighter green for emphasis
          ctx.fillStyle = 'rgba(0, 220, 100, 0.9)';
          ctx.fillText(text, i * fontSize, drops[i] * fontSize);
          ctx.fillStyle = 'rgba(0, 180, 85, 0.25)'; // Reset to default
        }
        
        // Move the drop down one position, with some randomization
        if (Math.random() > 0.975) {
          // Reset to top with randomization
          drops[i] = 0;
        }
        
        // Increment drop position
        drops[i]++;
        
        // If drop is off the screen, reset it
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
      }
    }
    
    // Animation loop
    setInterval(draw, 70); // Slightly faster animation
  }
}); 