export async function fetchAllPages<T>(fetchPage:(from:number,to:number)=>PromiseLike<{data:T[]|null,error:any}>,size=1000){
 const out:T[]=[]
 for(let from=0;;from+=size){const {data,error}=await fetchPage(from,from+size-1);if(error)throw error;const rows=data??[];out.push(...rows);if(rows.length<size)break}
 return out
}
