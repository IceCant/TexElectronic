import { useEffect,useMemo,useRef,useState } from "react";
import { Barcode,CaretDown,CheckCircle,Command,Crosshair,Eye,MagnifyingGlass,MapPin,SlidersHorizontal,Stack } from "@phosphor-icons/react";
import { useNavigate,useSearchParams } from "react-router-dom";
import { formatMoney,useData } from "../data.jsx";
import { ProductImage,RackMap,ScannerModal } from "../components/AppShell.jsx";

function normalized(query) {
  const value=query.trim().toLowerCase().replace(/[μµ]/g,"u").replace(/\s+/g,"");
  if (value.includes("220")&&value.includes("25v")) return "220µF · 25V";
  if (["100nf","0.1uf","104"].includes(value)) return "100nF ≡ 0.1µF";
  if (value.includes("lm358")) return "LM358";
  return query.trim()||"—";
}

function scoreProduct(product,query) {
  const needle=query.toLowerCase().replace(/[μµ\s-]/g,"");
  if (!needle) return 0;
  const exact=[product.barcode,product.sku,product.partNumber].map(value=>value.toLowerCase().replace(/[\s-]/g,""));
  if (exact.includes(needle)) return 1000;
  const aliases=product.aliases.map(value=>value.toLowerCase().replace(/[μµ\s-]/g,""));
  if (aliases.includes(needle)) return 900;
  const haystack=[product.name,product.shortName,product.category,product.manufacturer,...product.aliases,...Object.values(product.specs)].join(" ").toLowerCase().replace(/[μµ]/g,"u");
  const terms=query.toLowerCase().replace(/[μµ]/g,"u").split(/\s+/).filter(Boolean);
  return terms.reduce((sum,term)=>sum+(haystack.includes(term)?100:0),0);
}

export function SearchPage() {
  const { state }=useData(); const navigate=useNavigate(); const [params]=useSearchParams();
  const [query,setQuery]=useState(()=>params.get("q")||"220uf 25v"); const [selectedIndex,setSelectedIndex]=useState(0); const [showLocator,setShowLocator]=useState(true); const [scanOpen,setScanOpen]=useState(false); const inputRef=useRef(null);
  const products=useMemo(()=>state.products.map(product=>({product,score:scoreProduct(product,query)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).map(item=>item.product),[state.products,query]);
  const selected=products[Math.min(selectedIndex,products.length-1)];
  useEffect(()=>setSelectedIndex(0),[query]);
  useEffect(()=>{const handle=event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();inputRef.current?.focus()}if(event.key==="ArrowDown"){event.preventDefault();setSelectedIndex(index=>Math.min(index+1,products.length-1))}if(event.key==="ArrowUp"){event.preventDefault();setSelectedIndex(index=>Math.max(index-1,0))}if(event.key==="Enter"&&document.activeElement!==inputRef.current&&selected)navigate(`/products/${selected.id}`);if(event.key.toLowerCase()==="l"&&document.activeElement!==inputRef.current)setShowLocator(true)};window.addEventListener("keydown",handle);return()=>window.removeEventListener("keydown",handle)},[products.length,navigate,selected]);
  return <div className="search-page legacy-search"><div className="search-wrap"><MagnifyingGlass className="search-icon"/><input ref={inputRef} value={query} onChange={event=>setQuery(event.target.value)} aria-label="Search components" placeholder="Search part number, value, model, barcode..."/><span className="shortcut"><Command/>K</span><button className="scan-button" onClick={()=>setScanOpen(true)}><Barcode/><span>Scan</span></button></div>
    <div className="search-meta"><span><SlidersHorizontal/>Normalized: <strong>{normalized(query)}</strong></span><span>{products.length} ranked results</span></div>
    {selected?<div className="workspace"><section className="results-panel"><div className="section-title"><span>Results</span><small>Exact identifiers ranked first <CaretDown/></small></div><div className="result-list" role="listbox"><div className="result-heading"><span>Match</span><span>Part / description</span><span>Stock</span><span>Price</span><span/></div>{products.slice(0,8).map((product,index)=><button key={product.id} className={`result-row ${index===selectedIndex?"selected":""}`} role="option" aria-selected={index===selectedIndex} onClick={()=>setSelectedIndex(index)} onDoubleClick={()=>navigate(`/products/${product.id}`)}><span className="match-rank"><b>{index+1}</b><small>{index===0?<><Crosshair weight="fill"/>Exact match</>:"High match"}</small></span><span className="product-cell"><ProductImage product={product}/><span><strong>{product.shortName}</strong><small>{product.name}</small><code>{product.sku} · {product.partNumber}</code></span></span><span className="stock-cell"><strong>{product.totalStock.toLocaleString()}</strong><small>pcs available</small></span><span className="price-cell"><strong>{formatMoney(product.retailPrice)}</strong><small>{product.primaryLocation}</small></span><MapPin className="row-locate" weight={index===selectedIndex?"fill":"regular"}/></button>)}</div></section>
      <section className="detail-panel"><div className="detail-intro"><ProductImage product={selected} large/><div><span className="exact-badge"><CheckCircle weight="fill"/>Exact technical match</span><h2>{selected.shortName}</h2><p>{selected.name}</p><code>{selected.sku} · {selected.partNumber}</code></div></div><div className="price-stock"><div><small>Retail / pc</small><strong>{formatMoney(selected.retailPrice)}</strong></div><div><small>Available</small><strong>{selected.totalStock.toLocaleString()} <em>pcs</em></strong></div></div><div className="bulk-strip">{[{minQty:1,price:selected.retailPrice},...selected.priceTiers.slice().reverse()].map(tier=><span key={tier.minQty}><small>{tier.minQty.toLocaleString()}+</small>{formatMoney(tier.price)}</span>)}</div><div className="location-head"><div><small>Primary location</small><strong><MapPin weight="fill"/>{selected.primaryLocationPath}</strong></div><div className="detail-actions"><button className="secondary" onClick={()=>navigate(`/products/${selected.id}`)}><Eye/>Open</button><button onClick={()=>setShowLocator(value=>!value)}><Crosshair weight="bold"/>{showLocator?"Hide map":"Locate"}</button></div></div>{showLocator?<RackMap locationCode={selected.primaryLocation} path={selected.primaryLocationPath}/>:<dl className="spec-list">{Object.entries(selected.specs).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>}</section></div>:<div className="empty-state"><Stack weight="duotone"/><h2>No component found</h2><p>Try a SKU, part number, value, or alias.</p></div>}
    {scanOpen&&<ScannerModal onClose={()=>setScanOpen(false)}/>}</div>;
}
