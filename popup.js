// Popup logic: manage shortcut & trigger immediate Korea find
const shortcutInput = document.getElementById('shortcutInput');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');
const runBtn = document.getElementById('runBtn');

chrome.storage.sync.get({customShortcut:''}, ({customShortcut}) => {
	if (customShortcut) shortcutInput.value = customShortcut;
});

function validateShortcut(str){
	if (!str) return true;
	const parts = str.split('+');
	const key = parts[parts.length-1];
	const mods = parts.slice(0,-1).map(p=>p.toLowerCase());
	const validMod = ['ctrl','alt','shift','meta'];
	if (mods.some(m=>!validMod.includes(m))) return false;
	if (!/^[a-z]$/i.test(key) && !/^F([1-9]|1[0-2])$/i.test(key)) return false;
	return true;
}

saveBtn?.addEventListener('click', ()=>{
	const val = shortcutInput.value.trim();
	if (!validateShortcut(val)) {
		statusEl.textContent = '형식 오류';
		statusEl.classList.remove('ok');
		statusEl.classList.add('err');
		return;
	}
	chrome.storage.sync.set({customShortcut: val}, ()=>{
		statusEl.textContent = '저장됨';
		statusEl.classList.remove('err');
		statusEl.classList.add('ok');
		setTimeout(()=> statusEl.textContent='', 1800);
	});
});

runBtn?.addEventListener('click', async ()=>{
	const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
	if (!tab?.id) return;
	try {
		await chrome.scripting.executeScript({target:{tabId:tab.id}, files:['contentScript.js']});
		await chrome.tabs.sendMessage(tab.id, {type:'FIND_KOREA'});
		window.close();
	} catch(e){
		console.error(e);
		statusEl.textContent = '실패';
		statusEl.classList.add('err');
	}
});
