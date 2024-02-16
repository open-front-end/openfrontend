if (window.location.pathname === '/') {
    var animation = lottie.loadAnimation({
        container: document.getElementById('lottie-container'),
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'home_animation.json',
    });
    animation.setSpeed(0.2);
}
