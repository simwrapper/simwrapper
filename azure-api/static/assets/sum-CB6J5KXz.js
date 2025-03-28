function o(f,n){let t=0;if(n===void 0)for(let e of f)(e=+e)&&(t+=e);else{let e=-1;for(let i of f)(i=+n(i,++e,f))&&(t+=i)}return t}export{o as s};
