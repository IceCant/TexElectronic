import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Barcode, CaretDown, ChartLineUp, CirclesFour, Cube, DotsThree,
  MagnifyingGlass, MapPin, Package, Receipt, Tag, UserCircle,
  UsersThree, Warehouse,
} from "@phosphor-icons/react";
import { useData } from "../data.jsx";

const styleInfo = {
  1:{ label:"Style 1",name:"Precision Workbench",tone:"Dark workbench" },
  2:{ label:"Style 2",name:"Component Library",tone:"Bright catalogue" },
  3:{ label:"Style 3",name:"Signal Console",tone:"Command console" },
};

const navItems = [
  ["/dashboard","Dashboard",CirclesFour], ["/search","Search",MagnifyingGlass], ["/pos","POS",Receipt],
  ["/inventory","Inventory",Cube], ["/products","Products",Package], ["/locations","Locations",MapPin],
];

export function ProductImage({ product, large=false }) {
  const fallback="/assets/capacitor-220uf-25v.png";
  const useFallback=event=>{if(event.currentTarget.src.endsWith(fallback))return;event.currentTarget.src=fallback;};
  return <img className={large ? "product-image large" : "product-image"} src={product?.image || fallback} alt={product?.name || "Electronic component"} loading={large?"eager":"lazy"} decoding="async" onError={useFallback}/>;
}

export function RackMap({ locationCode="B3-12", path }) {
  const parts = locationCode.match(/^([A-Z]+)(\d+)-?(\d+)/i);
  const rack = parts?.[1] || "B"; const activeShelf = Number(parts?.[2] || 3); const activeBin = Number(parts?.[3] || 12);
  return <div className="rack-map" aria-label={`Visual location ${path || locationCode}`}>
    <div className="rack-label"><span>Rack {rack}</span><small>Front elevation</small></div>
    {[5,4,3,2,1].map(shelf=><div className={`shelf ${shelf===activeShelf?"active-shelf":""}`} key={shelf}><span className="shelf-number">{shelf}</span><div className="bins">{Array.from({length:14},(_,index)=>index+1).map(bin=><span className={shelf===activeShelf&&bin===activeBin?"active-bin":""} key={bin}>{String(bin).padStart(2,"0")}</span>)}</div></div>)}
    <div className="rack-foot"><span>Aisle 02</span><strong>Rack {rack}</strong><span>Aisle 03</span></div>
  </div>;
}

function StylePicker({ style,onChange }) {
  const [open,setOpen] = useState(false);
  return <aside className={`style-picker dev-style-picker ${open?"open":"collapsed"}`} aria-label="Development style options">
    <button className="dev-toggle" onClick={()=>setOpen(value=>!value)} title="Development style switcher"><ChartLineUp/> <span>Demo style</span></button>
    {open&&<><div className="picker-title"><span>Development only</span><strong>{styleInfo[style].name}</strong></div><div className="picker-buttons">{[1,2,3].map(value=><button key={value} className={style===value?"active":""} onClick={()=>onChange(value)}>{styleInfo[value].label}</button>)}</div><small>{styleInfo[style].tone}</small></>}
  </aside>;
}

function Header() {
  const [moreOpen,setMoreOpen] = useState(false);
  const moreNavRef = useRef(null);
  const location = useLocation();

  useEffect(()=>setMoreOpen(false),[location.pathname]);
  useEffect(()=>{
    if(!moreOpen)return undefined;
    const closeOnOutsidePointer=event=>{if(!moreNavRef.current?.contains(event.target))setMoreOpen(false);};
    const closeOnEscape=event=>{if(event.key==="Escape")setMoreOpen(false);};
    window.addEventListener("pointerdown",closeOnOutsidePointer);
    window.addEventListener("keydown",closeOnEscape);
    return()=>{
      window.removeEventListener("pointerdown",closeOnOutsidePointer);
      window.removeEventListener("keydown",closeOnEscape);
    };
  },[moreOpen]);

  return <header className="app-header routed-header">
    <NavLink to="/dashboard" className="brand"><strong>Tex Electronic</strong><span>Find. Locate. Control.</span></NavLink>
    <nav>{navItems.map(([path,label,Icon])=><NavLink key={path} to={path} className={({isActive})=>isActive?"active":""}><Icon weight="duotone"/>{label}</NavLink>)}
      <div className="more-nav" ref={moreNavRef}><button aria-expanded={moreOpen} aria-haspopup="menu" onClick={()=>setMoreOpen(value=>!value)}><DotsThree/>More<CaretDown/></button>{moreOpen&&<div className="more-menu" role="menu"><NavLink role="menuitem" to="/stock-counts"><Warehouse/>Stock Counts</NavLink><NavLink role="menuitem" to="/labels"><Tag/>Labels</NavLink><NavLink role="menuitem" to="/staff"><UsersThree/>Staff</NavLink></div>}</div>
    </nav>
    <button className="account"><UserCircle weight="duotone"/><span>Alex Turner<small>Supervisor</small></span><CaretDown/></button>
  </header>;
}

function MobileNav() {
  return <nav className="mobile-nav">{[["/dashboard","Home",CirclesFour],["/search","Search",MagnifyingGlass],["/pos","POS",Receipt],["/inventory","Stock",Cube],["/staff","More",DotsThree]].map(([path,label,Icon])=><NavLink key={path} to={path} className={({isActive})=>isActive?"active":""}><Icon weight="duotone"/><span>{label}</span></NavLink>)}</nav>;
}

export function PageHeader({ eyebrow,title,description,actions }) {
  return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description&&<p>{description}</p>}</div>{actions&&<div className="page-actions">{actions}</div>}</div>;
}

export function Modal({ title,onClose,children,wide=false }) {
  useEffect(()=>{const close=event=>event.key==="Escape"&&onClose();window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close)},[onClose]);
  return <div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><section className={`modal ${wide?"wide":""}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button onClick={onClose} aria-label="Close">×</button></header>{children}</section></div>;
}

export function EmptyState({ icon:Icon=Package,title,description }) { return <div className="empty-state compact"><Icon weight="duotone"/><h2>{title}</h2><p>{description}</p></div>; }

export function AppShell() {
  const [style,setStyle] = useState(()=>Number(localStorage.getItem("tex-style"))||1);
  const { state,error,notice } = useData();
  const location = useLocation(); const navigate = useNavigate();
  useEffect(()=>{if(location.pathname==="/")navigate("/dashboard",{replace:true})},[location.pathname,navigate]);
  const selectStyle=value=>{setStyle(value);localStorage.setItem("tex-style",String(value));};
  return <div className={`app-shell routed-app style-${style}`}><StylePicker style={style} onChange={selectStyle}/><Header/>{error&&<div className="global-alert error">{error}</div>}{notice&&<div className="global-alert success">{notice}</div>}<main className="route-main">{state?<Outlet/>:<div className="loading-state">Loading shared catalogue and inventory…</div>}</main><MobileNav/></div>;
}

export function ScannerModal({ onClose }) {
  const { state } = useData(); const navigate=useNavigate(); const [barcode,setBarcode]=useState(""); const [error,setError]=useState("");
  const submit=event=>{event.preventDefault();const product=state.products.find(item=>item.barcode===barcode.trim());if(!product){setError("No exact barcode match. Fuzzy search is intentionally disabled for scans.");return;}onClose();navigate(`/products/${product.id}`);};
  return <Modal title="Scan product barcode" onClose={onClose}><form className="stack-form" onSubmit={submit}><p>Use a USB/Bluetooth scanner or enter the barcode manually. Exact matches open immediately.</p><label>Barcode<input autoFocus value={barcode} onChange={event=>setBarcode(event.target.value)} placeholder="885000210041"/></label>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit"><Barcode/>Find exact product</button></div></form></Modal>;
}
