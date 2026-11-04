import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TodoistFloatingCard} from '../src/components/TodoistFloatingCard';
import {ApiClient} from '../src/services/apiClient';
import type {TodoistTask} from '../src/types';
const pipScenario = new URLSearchParams(location.search).get('pip');
if (pipScenario === 'unsupported' || pipScenario === 'blocked') Object.defineProperty(window, 'documentPictureInPicture', {
  value: pipScenario === 'unsupported' ? undefined : { requestWindow: () => Promise.reject(new DOMException('Fixture policy restriction', 'NotAllowedError')) },
});
function Preview() {
  const [tasks,setTasks] = useState<TodoistTask[]>();
  const [pending,setPending] = useState(new Set<string>());
  const [errors,setErrors] = useState<Record<string,string>>({});
  const [expired,setExpired] = useState(false);
  const locks=useRef(new Set<string>());
  useEffect(()=>{const fn=()=>setExpired(true);window.addEventListener('unauthorized',fn);return()=>window.removeEventListener('unauthorized',fn);},[]);
  return <main style={{fontFamily:'system-ui',padding:24,maxWidth:650}}><h1>Task card verification</h1><p>LOCAL FIXTURE DATA ONLY — no Todoist account or credentials.</p>
    <label>Scenario <select aria-label="Scenario" onChange={async e=>{await fetch('/api/fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:e.target.value})});setErrors({});window.dispatchEvent(new Event('todoist-connection-changed'));}}>{['connected','completion-error','read-error','empty','disconnected','expired'].map(mode=><option key={mode}>{mode}</option>)}</select></label>
    <p>Normal website task list (same shared data):</p><ul>{tasks?.filter(t=>!t.completed).map(t=><li key={t.id}>{t.title}</li>)}</ul>
    {expired ? <h2>Session expired — task card closed</h2> : <TodoistFloatingCard tasks={tasks} completing={pending} errors={errors} onConnections={()=>alert('Existing Settings → Connections opens here in the real app.')} onTasks={setTasks} onComplete={async id=>{
      if(locks.current.has(id))return;locks.current.add(id);setPending(prev=>new Set(prev).add(id));setErrors(prev=>({...prev,[id]:''}));
      try{await ApiClient.completeTodoistTask(id);setTasks(prev=>prev?.map(t=>t.id===id?{...t,completed:true}:t));}
      catch(e:any){setErrors(prev=>({...prev,[id]:e.message}));}
      finally{locks.current.delete(id);setPending(prev=>{const next=new Set(prev);next.delete(id);return next;});}
    }}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
