// Debug Script - Verificar se as abas estão funcionando

document.addEventListener('DOMContentLoaded', function() {
    console.log('=== DEBUG ABAS ===');
    
    // Verificar se os elementos existem
    const tabBtns = document.querySelectorAll('.tab-btn');
    const googleTab = document.getElementById('googleTab');
    const emailTab = document.getElementById('emailTab');
    
    console.log('Botões de aba encontrados:', tabBtns.length);
    console.log('Google tab:', googleTab);
    console.log('Email tab:', emailTab);
    
    // Adicionar listeners de debug
    tabBtns.forEach((btn, index) => {
        console.log(`Aba ${index}:`, btn.getAttribute('data-tab'));
        
        btn.addEventListener('click', function(e) {
            console.log(`CLICK DETECTADO na aba: ${btn.getAttribute('data-tab')}`);
            e.preventDefault();
            
            // Force switch
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const tabName = btn.getAttribute('data-tab');
            document.getElementById(tabName + 'Tab').classList.add('active');
            
            console.log(`Forçado switch para: ${tabName}`);
        });
    });
});