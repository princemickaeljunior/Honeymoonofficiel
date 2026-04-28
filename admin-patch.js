// Patch — Ajoute le champ numéro dans le formulaire créatrice
document.addEventListener("DOMContentLoaded", function() {
  
  // Attendre que le dashboard soit chargé
  setTimeout(function() {
    
    // Chercher le select de formule contractuelle
    var formulaSelect = document.querySelector('select[id*="formula"], select[id*="formule"], #adm-creator-formula');
    
    if (!formulaSelect) return;
    
    // Vérifier si le champ numéro existe déjà
    if (document.getElementById('adm-creator-number')) return;
    
    // Créer le champ numéro
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-top:16px;';
    wrapper.innerHTML = `
      <label style="font-family:'Montserrat',sans-serif;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(214,169,78,0
