(() => {
  const dialog=document.getElementById('experimental-disclaimer');
  if(!dialog)return;
  document.getElementById('acknowledge-experimental').addEventListener('click',()=>dialog.close());
  document.getElementById('show-experimental-disclaimer').addEventListener('click',()=>dialog.showModal());
  // Intentionally shown on every page load, without a remembered acceptance.
  dialog.showModal();
})();
