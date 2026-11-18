// Optimized local acceptance build. Synthetic endpoints only; production config is unchanged.
import {build} from 'vite';
process.env.VITE_API_URL='http://127.0.0.1:18280';
process.env.VITE_SIGNING_PUBLIC_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
await build({root:process.cwd(),mode:'qa',envDir:false,logLevel:'warn',build:{minify:true,sourcemap:false}});
