document.addEventListener("DOMContentLoaded", function () {
    // Initialize Lottie animation
    var animation = lottie.loadAnimation({
        container: document.getElementById('lottie-container'), // Container element
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'sRvmudTB3W.json', // Path to your JSON file
    });
    animation.setSpeed(0.2);
});
